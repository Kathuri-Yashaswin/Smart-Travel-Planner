import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import dns from "dns";
import https from "https";

// Fix DNS resolution issues on Windows
dns.setServers(['8.8.8.8', '8.8.4.4']);

dotenv.config();

const app = express();

// Create HTTPS agent with proper settings
const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 1000,
  rejectUnauthorized: false
});

// Configure axios defaults
axios.defaults.timeout = 30000;
axios.defaults.httpsAgent = httpsAgent;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Validate environment variables on startup
if (!process.env.GEMINI_API_KEY) {
  console.error("❌ Missing GEMINI_API_KEY environment variable");
  process.exit(1);
}

if (!process.env.UNSPLASH_API_KEY) {
  console.error("❌ Missing UNSPLASH_API_KEY environment variable");
  process.exit(1);
}

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Home route
app.get("/", (req, res) => {
  res.render("index");
});

// Test route for Gemini - lists available models
app.get("/test-gemini", async (req, res) => {
  try {
    const modelsResponse = await axios.get(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`,
      { httpsAgent, timeout: 15000 }
    );
    
    const availableModels = modelsResponse.data.models
      .filter(model => model.supportedGenerationMethods && model.supportedGenerationMethods.includes('generateContent'))
      .map(model => model.name);
    
    res.json({
      availableModels,
      allModels: modelsResponse.data.models
    });
  } catch (error) {
    console.error("Error fetching models:", error.response?.data || error.message);
    res.status(500).json({ 
      error: error.response?.data || error.message,
      message: "Check your Gemini API key and ensure it has proper permissions"
    });
  }
});

// Generate travel plan
app.post("/plan", async (req, res) => {
  let { city, interests, days } = req.body;
  
  // Debug: Log the received data
  console.log("Received data:", { city, interests, days, body: req.body });
  
  // Handle interests if it's an array (from multiple checkboxes)
  let interestsText;
  if (Array.isArray(interests)) {
    interestsText = interests.join(", ");
  } else if (typeof interests === 'string') {
    interestsText = interests;
  } else if (interests) {
    interestsText = String(interests);
  } else {
    interestsText = 'general sightseeing';
  }
  
  // Handle city if it's an array (unlikely but safe)
  let cityText;
  if (Array.isArray(city)) {
    cityText = city[0];
  } else if (typeof city === 'string') {
    cityText = city;
  } else if (city) {
    cityText = String(city);
  } else {
    cityText = 'Unknown City';
  }

  // Handle days
  const daysCount = parseInt(days) || 3;
  
  // Input validation
  if (!cityText || cityText.trim() === '') {
    return res.render("error", {
      message: "Please provide a city name"
    });
  }
  
  if (!interestsText || interestsText.trim() === '') {
    return res.render("error", {
      message: "Please provide your travel interests"
    });
  }
  
  if (cityText.length > 100 || interestsText.length > 200) {
    return res.render("error", {
      message: "Input too long. Please shorten your city name or interests."
    });
  }

  // Basic sanitization
  const sanitizedCity = cityText.trim().replace(/[<>]/g, '');
  const sanitizedInterests = interestsText.trim().replace(/[<>]/g, '');

  console.log("Processing request for:", { sanitizedCity, sanitizedInterests, daysCount });

  try {
    let plan;
    let usingMockData = false;

    // Try to get available models first
    try {
      const modelsResponse = await axios.get(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`,
        { 
          timeout: 15000,
          httpsAgent
        }
      );

      const availableModels = modelsResponse.data.models
        .filter(model => model.supportedGenerationMethods && model.supportedGenerationMethods.includes('generateContent'))
        .map(model => model.name.split('/').pop()); // Get just the model name

      console.log("Available models:", availableModels);

      // Use Gemini 2.5 Flash specifically
      const desiredModel = 'gemini-2.5-flash';
      if (availableModels.includes(desiredModel)) {
        const model = desiredModel;
        console.log(`Using Gemini 2.5 Flash model: ${model}`);
        
        const geminiResponse = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
          {
            contents: [
              {
                parts: [
                  {
                    text: `Generate a detailed ${daysCount}-day travel itinerary for ${sanitizedCity} focusing on ${sanitizedInterests}. 
                           Return a valid JSON object with this exact structure:
                           {
                             "days": [
                               {
                                 "day": 1,
                                 "activities": ["morning activity", "afternoon activity", "evening activity"]
                               },
                               {
                                 "day": 2, 
                                 "activities": ["morning activity", "afternoon activity", "evening activity"]
                               }
                             ],
                             "tips": ["tip1", "tip2", "tip3", "tip4"],
                             "packing": ["item1", "item2", "item3", "item4", "item5"]
                           }
                           Make the itinerary realistic, practical and tailored to the interests. Return exactly ${daysCount} days.`
                  },
                ],
              },
            ],
          },
          {
            timeout: 30000,
            httpsAgent
          }
        );

        // Parse Gemini response
        let aiText = geminiResponse.data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (aiText) {
          aiText = aiText.replace(/```json|```/g, "").trim();
          try {
            plan = JSON.parse(aiText);
            if (!plan.days || !Array.isArray(plan.days) || !plan.tips || !plan.packing) {
              throw new Error("Invalid response structure from AI");
            }
            console.log("✅ Successfully generated plan with Gemini");
          } catch (parseError) {
            console.error("Failed to parse JSON from Gemini, using mock data");
            usingMockData = true;
          }
        } else {
          usingMockData = true;
        }
      } else {
        usingMockData = true;
        console.log("No available models found, using mock data");
      }
    } catch (geminiError) {
      console.error("Gemini API error:", geminiError.response?.data?.error?.message || geminiError.message);
      usingMockData = true;
    }

    // Use mock data if Gemini fails
    if (usingMockData) {
      console.log("Using mock data for travel plan");
      plan = generateMockTravelPlan(sanitizedCity, sanitizedInterests, daysCount);
    }

    // ✅ Unsplash API for city images
    let images = [];
    try {
      const unsplashResponse = await axios.get(
        `https://api.unsplash.com/search/photos`,
        {
          params: {
            query: sanitizedCity + " travel landscape",
            per_page: 6,
            orientation: "landscape",
            client_id: process.env.UNSPLASH_API_KEY,
          },
          timeout: 15000,
          httpsAgent
        }
      );

      images = unsplashResponse.data.results.map((img) => img.urls.regular);
    } catch (unsplashError) {
      console.error("Unsplash API error:", unsplashError.message);
      // Use placeholder images
      images = [
        "https://images.unsplash.com/photo-1488646953014-85cb44e25828?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1000&q=80",
        "https://images.unsplash.com/photo-1469474968028-56623f02e42e?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1000&q=80"
      ];
    }

    // Render plan page
    res.render("plan", { 
      city: sanitizedCity, 
      plan, 
      images,
      usingMockData,
      days: daysCount
    });
  } catch (error) {
    console.error("Error generating travel plan:", error.message);
    
    let errorMessage = "Error generating travel plan. Please try again.";
    
    if (error.code === 'ECONNABORTED') {
      errorMessage = "Request timed out. Please try again.";
    } else if (error.response?.status === 429) {
      errorMessage = "Too many requests. Please try again later.";
    } else if (error.response?.status === 401) {
      errorMessage = "API key invalid. Please check your configuration.";
    } else if (error.response?.status === 403) {
      errorMessage = "API access denied. Please check your API keys.";
    }
    
    res.render("error", { message: errorMessage });
  }
});

// Mock data generator function
function generateMockTravelPlan(city, interests, daysCount = 3) {
  const interestsList = interests.split(',').map(i => i.trim().toLowerCase());
  
  const activitiesByInterest = {
    culture: [
      "Visit local museums and art galleries",
      "Explore historical landmarks and monuments",
      "Attend cultural performances or festivals",
      "Take a guided heritage walk",
      "Visit traditional craft centers",
      "Explore local architecture",
      "Visit religious sites and temples"
    ],
    food: [
      "Take a food tour of local specialties",
      "Visit bustling food markets",
      "Try cooking classes for local cuisine",
      "Explore street food hotspots",
      "Dine at authentic local restaurants",
      "Visit vineyards or breweries",
      "Try traditional desserts and snacks"
    ],
    adventure: [
      "Go hiking in nearby natural areas",
      "Try water sports or outdoor activities",
      "Explore adventure parks",
      "Take scenic bike tours",
      "Go on wildlife spotting excursions",
      "Try rock climbing or zip-lining",
      "Go camping in nature reserves"
    ],
    nature: [
      "Visit botanical gardens and parks",
      "Explore nature reserves",
      "Take scenic walks or hikes",
      "Visit waterfalls or natural landmarks",
      "Enjoy bird watching",
      "Go on a safari or wildlife tour",
      "Visit beaches or coastal areas"
    ],
    relaxation: [
      "Visit spas and wellness centers",
      "Enjoy beach or pool time",
      "Take leisurely scenic drives",
      "Visit peaceful gardens or temples",
      "Enjoy sunset views",
      "Practice yoga or meditation",
      "Read at cozy cafes"
    ],
    shopping: [
      "Explore local markets and bazaars",
      "Visit shopping malls and boutiques",
      "Look for handicrafts and souvenirs",
      "Visit antique shops",
      "Explore fashion districts",
      "Visit local artisan workshops",
      "Shop for traditional products"
    ]
  };

  // Select relevant activities based on interests
  let selectedActivities = [];
  interestsList.forEach(interest => {
    if (activitiesByInterest[interest]) {
      selectedActivities = [...selectedActivities, ...activitiesByInterest[interest]];
    }
  });

  // Fallback if no specific interests match
  if (selectedActivities.length === 0) {
    selectedActivities = [
      "Explore city center and main attractions",
      "Visit local markets and shopping areas",
      "Try local cuisine at recommended restaurants",
      "Take photos at scenic viewpoints",
      "Learn about local history and culture",
      "Relax at parks or public spaces",
      "Experience local nightlife"
    ];
  }

  // Generate days based on daysCount
  const days = [];
  for (let i = 1; i <= daysCount; i++) {
    const dayActivities = [];
    
    if (i === 1) {
      // First day - arrival
      dayActivities.push(
        `Morning: Arrive in ${city} and check into accommodation`,
        `Afternoon: ${selectedActivities[0] || `Explore ${city} city center`}`,
        `Evening: ${selectedActivities[1] || `Enjoy local cuisine and relax`}`
      );
    } else if (i === daysCount) {
      // Last day - departure
      dayActivities.push(
        `Morning: ${selectedActivities[(i-1)*3] || `Visit remaining must-see locations`}`,
        `Afternoon: ${selectedActivities[(i-1)*3 + 1] || `Last-minute shopping and sightseeing`}`,
        `Evening: Depart from ${city} with wonderful memories`
      );
    } else {
      // Middle days
      dayActivities.push(
        `Morning: ${selectedActivities[(i-1)*3] || `Explore popular attractions in ${city}`}`,
        `Afternoon: ${selectedActivities[(i-1)*3 + 1] || `Experience local culture and traditions`}`,
        `Evening: ${selectedActivities[(i-1)*3 + 2] || `Dine at authentic local restaurants`}`
      );
    }
    
    days.push({
      day: i,
      activities: dayActivities
    });
  }

  return {
    days,
    tips: [
      "Check the weather forecast before your trip",
      "Carry local currency for small purchases",
      "Learn a few basic phrases in the local language",
      "Keep emergency contacts and documents handy",
      "Respect local customs and traditions",
      "Stay hydrated and wear comfortable shoes",
      "Download offline maps and translation apps",
      "Inform your bank about your travel plans"
    ],
    packing: [
      "Comfortable walking shoes",
      "Weather-appropriate clothing",
      "Travel documents and copies",
      "Charger and power bank",
      "Basic first aid kit",
      "Reusable water bottle",
      "Camera or smartphone for photos",
      "Travel adapter if needed",
      "Sunscreen and hat",
      "Personal toiletries and medications"
    ]
  };
}

// Health check route
app.get("/health", (req, res) => {
  res.json({ 
    status: "OK", 
    timestamp: new Date().toISOString(),
    services: {
      gemini: !!process.env.GEMINI_API_KEY,
      unsplash: !!process.env.UNSPLASH_API_KEY
    }
  });
});

// List available models (for debugging)
app.get("/models", async (req, res) => {
  try {
    const response = await axios.get(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`,
      { httpsAgent, timeout: 15000 }
    );
    
    const availableModels = response.data.models
      .filter(model => model.supportedGenerationMethods && model.supportedGenerationMethods.includes('generateContent'))
      .map(model => ({
        name: model.name,
        displayName: model.displayName,
        description: model.description,
        supportedMethods: model.supportedGenerationMethods
      }));
    
    res.json({
      availableModels,
      totalModels: response.data.models.length
    });
  } catch (error) {
    res.status(500).json({ 
      error: error.response?.data || error.message,
      message: "Cannot fetch models. Check your API key."
    });
  }
});

// Error page fallback
app.get("/error", (req, res) => {
  res.render("error", {
    message: "Something went wrong. Please try again.",
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).render("error", {
    message: "Page not found."
  });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error("Global error handler:", error);
  res.status(500).render("error", {
    message: "Internal server error. Please try again later."
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`✅ Gemini API: ${process.env.GEMINI_API_KEY ? 'Configured' : 'Missing'}`);
  console.log(`✅ Unsplash API: ${process.env.UNSPLASH_API_KEY ? 'Configured' : 'Missing'}`);
  console.log(`📝 Test Gemini models at: http://localhost:${PORT}/test-gemini`);
  console.log(`📝 Check available models at: http://localhost:${PORT}/models`);
});