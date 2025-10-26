// Enhanced script with better animations and interactions
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Smart Travel Planner Enhanced Script Loaded');
    
    // Initialize components
    initFormInteractions();
    initAnimations();
    initImageLoading();
    initProgressBar();
});

function initFormInteractions() {
    // Enhanced form submission with progress indication
    document.querySelectorAll('form').forEach(form => {
        form.addEventListener('submit', function(e) {
            const submitBtn = this.querySelector('button[type="submit"], .form-btn');
            if (submitBtn) {
                submitBtn.innerHTML = `
                    <span class="loading"></span>
                    <span>Generating Your Travel Plan...</span>
                `;
                submitBtn.disabled = true;
                
                // Add progress bar animation
                const progressBar = document.createElement('div');
                progressBar.className = 'progress-bar';
                progressBar.innerHTML = '<div class="progress-fill" style="width: 0%"></div>';
                submitBtn.parentNode.insertBefore(progressBar, submitBtn.nextSibling);
                
                // Animate progress bar
                const progressFill = progressBar.querySelector('.progress-fill');
                let progress = 0;
                const interval = setInterval(() => {
                    progress += Math.random() * 10;
                    if (progress >= 90) {
                        progress = 90;
                        clearInterval(interval);
                    }
                    progressFill.style.width = progress + '%';
                }, 200);
            }
        });
    });

    // Enhanced interest selection with visual feedback
    document.querySelectorAll('.interest-option').forEach(option => {
        option.addEventListener('click', function() {
            const checkbox = this.querySelector('input[type="checkbox"]');
            checkbox.checked = !checkbox.checked;
            
            // Add ripple effect
            const ripple = document.createElement('span');
            ripple.style.cssText = `
                position: absolute;
                border-radius: 50%;
                background: rgba(99, 102, 241, 0.3);
                transform: scale(0);
                animation: ripple 0.6s linear;
                pointer-events: none;
            `;
            
            const size = Math.max(this.offsetWidth, this.offsetHeight);
            const rect = this.getBoundingClientRect();
            ripple.style.width = ripple.style.height = size + 'px';
            ripple.style.left = (event.clientX - rect.left - size / 2) + 'px';
            ripple.style.top = (event.clientY - rect.top - size / 2) + 'px';
            
            this.appendChild(ripple);
            
            setTimeout(() => {
                ripple.remove();
            }, 600);
            
            // Visual feedback
            this.style.transform = 'scale(0.95)';
            setTimeout(() => {
                this.style.transform = '';
            }, 150);
        });
    });

    // Auto-save form data
    const form = document.querySelector('form');
    if (form) {
        const formData = JSON.parse(localStorage.getItem('travelFormData') || '{}');
        
        // Restore form data
        Object.keys(formData).forEach(key => {
            const element = form.querySelector(`[name="${key}"]`);
            if (element) {
                if (element.type === 'checkbox') {
                    element.checked = formData[key];
                } else {
                    element.value = formData[key];
                }
            }
        });

        // Save on change
        form.addEventListener('input', debounce(function(e) {
            const formData = new FormData(form);
            const data = {};
            for (let [key, value] of formData.entries()) {
                if (form.querySelector(`[name="${key}"]`).type === 'checkbox') {
                    data[key] = form.querySelectorAll(`[name="${key}"]:checked`).length > 0;
                } else {
                    data[key] = value;
                }
            }
            localStorage.setItem('travelFormData', JSON.stringify(data));
        }, 500));
    }
}

function initAnimations() {
    // Intersection Observer for scroll animations
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.animationPlayState = 'running';
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    // Observe elements for scroll animations
    document.querySelectorAll('.section, .day-plan, .image-item, .form-group').forEach(el => {
        el.style.animationPlayState = 'paused';
        observer.observe(el);
    });

    // Parallax effect for background
    window.addEventListener('scroll', function() {
        const scrolled = window.pageYOffset;
        const parallax = document.querySelector('body');
        if (parallax) {
            parallax.style.backgroundPosition = `center ${scrolled * 0.3}px`;
        }
    });

    // Enhanced hover effects
    document.querySelectorAll('.btn, .interest-option, .day-plan').forEach(el => {
        el.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-2px)';
        });
        
        el.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(0)';
        });
    });
}

function initImageLoading() {
    // Enhanced image loading with fade-in
    document.querySelectorAll('img').forEach(img => {
        img.addEventListener('load', function() {
            this.style.opacity = '1';
            this.style.transform = 'scale(1)';
        });
        
        // Add loading state
        img.style.opacity = '0';
        img.style.transform = 'scale(1.1)';
        img.style.transition = 'opacity 0.5s ease-in-out, transform 0.5s ease-in-out';
        
        // Force load if already cached
        if (img.complete) {
            img.dispatchEvent(new Event('load'));
        }
    });
}

function initProgressBar() {
    // Add CSS for ripple animation
    if (!document.querySelector('#dynamic-styles')) {
        const styles = document.createElement('style');
        styles.id = 'dynamic-styles';
        styles.textContent = `
            @keyframes ripple {
                to {
                    transform: scale(4);
                    opacity: 0;
                }
            }
        `;
        document.head.appendChild(styles);
    }
}

// Utility functions
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <div class="toast-content">
            <span class="toast-message">${message}</span>
            <button class="toast-close">&times;</button>
        </div>
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => toast.classList.add('show'), 100);
    
    // Auto remove
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 5000);
    
    // Manual close
    toast.querySelector('.toast-close').addEventListener('click', () => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    });
}

// Export for global access
window.TravelPlanner = {
    showToast,
    initFormInteractions,
    initAnimations
};