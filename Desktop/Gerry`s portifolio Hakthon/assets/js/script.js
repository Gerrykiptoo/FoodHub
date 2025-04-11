document.addEventListener('DOMContentLoaded', function () {
    // ========== MOBILE MENU ========== //
    const menuToggle = document.querySelector('.menu-toggle');
    const navLinks = document.querySelector('.nav-links');

    if (menuToggle && navLinks) {
        menuToggle.addEventListener('click', function(event) {
            navLinks.classList.toggle('active');
            this.setAttribute('aria-expanded', navLinks.classList.contains('active'));
            event.stopPropagation();
        });

        document.addEventListener('click', function(event) {
            if (!navLinks.contains(event.target) && !menuToggle.contains(event.target)) {
                navLinks.classList.remove('active');
                menuToggle.setAttribute('aria-expanded', 'false');
            }
        });
    }

    // ========== SMOOTH SCROLL WITH ACTIVE LINK HIGHLIGHTING ========== //
    const sections = document.querySelectorAll('section');
    const navItems = document.querySelectorAll('.nav-links a');
    
    window.addEventListener('scroll', function() {
        let current = '';
        
        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            const sectionHeight = section.clientHeight;
            
            if (pageYOffset >= (sectionTop - 300)) {
                current = section.getAttribute('id');
            }
        });
        
        navItems.forEach(item => {
            item.classList.remove('active');
            if (item.getAttribute('href') === `#${current}`) {
                item.classList.add('active');
            }
        });
    });

    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    // ========== FORM HANDLING WITH FETCH API ========== //
    const contactForm = document.getElementById('contactForm');
    if (contactForm) {
        contactForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const formData = {
                name: this.name.value,
                email: this.email.value,
                subject: this.subject.value,
                message: this.message.value
            };
            
            const submitBtn = this.querySelector('button[type="submit"]');
            const originalBtnText = submitBtn.textContent;
            
            submitBtn.textContent = 'Sending...';
            submitBtn.disabled = true;
            
            try {
                const response = await fetch('http://localhost:3000/api/contact', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(formData)
                });
                
                const data = await response.json();
                
                if (data.success) {
                    showNotification('Message sent successfully!', 'success');
                    this.reset();
                } else {
                    showNotification(data.message || 'Error sending message', 'error');
                }
            } catch (error) {
                showNotification('Network error. Please try again.', 'error');
                console.error('Error:', error);
            } finally {
                submitBtn.textContent = originalBtnText;
                submitBtn.disabled = false;
            }
        });
    }

    // ========== THEME TOGGLE ========== //
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        // Initialize theme
        const savedTheme = localStorage.getItem('theme') || 'light';
        document.body.classList.toggle('dark-mode', savedTheme === 'dark');
        
        // Set initial icon
        const icon = themeToggle.querySelector('i');
        if (savedTheme === 'dark') {
            icon.classList.remove('fa-moon');
            icon.classList.add('fa-sun');
        }
        
        themeToggle.addEventListener('click', function() {
            const isDark = document.body.classList.toggle('dark-mode');
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
            
            const icon = this.querySelector('i');
            icon.classList.toggle('fa-moon', !isDark);
            icon.classList.toggle('fa-sun', isDark);
        });
    }

    // ========== SCROLL ANIMATIONS ========== //
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate');
            }
        });
    }, {
        threshold: 0.1
    });

    document.querySelectorAll('.fade-in').forEach(el => {
        observer.observe(el);
    });

    // ========== LOAD PROJECTS FROM DATABASE ========== //
    loadProjects();

    // ========== NOTIFICATION FUNCTION ========== //
    function showNotification(message, type) {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.classList.add('show');
        }, 10);
        
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                notification.remove();
            }, 300);
        }, 3000);
    }

    // ========== DYNAMIC YEAR IN FOOTER ========== //
    document.querySelector('footer p').textContent = `© ${new Date().getFullYear()} Gerry Biwott. All rights reserved.`;
});

// ========== LOAD PROJECTS FROM DATABASE API ========== //
async function loadProjects() {
    try {
        const response = await fetch('http://localhost:3000/api/projects');
        const data = await response.json();
        
        if (data.success && data.projects.length > 0) {
            const container = document.querySelector('.project-cards-container');
            container.innerHTML = ''; // Clear existing content
            
            data.projects.forEach(project => {
                const projectCard = document.createElement('div');
                projectCard.className = 'project-card fade-in';
                
                projectCard.innerHTML = `
                    <img src="${project.image_url}" alt="${project.title}">
                    <h3>${project.title}</h3>
                    <p>${project.description}</p>
                    <div class="project-links">
                        <a href="${project.github_url}" target="_blank">View on GitHub</a>
                        ${project.live_url ? `<a href="${project.live_url}" target="_blank" style="margin-left: 1rem;">Live Demo</a>` : ''}
                    </div>
                    <div class="project-tech">
                        ${project.technologies.split(',').map(tech => `<span>${tech.trim()}</span>`).join('')}
                    </div>
                `;
                
                container.appendChild(projectCard);
            });
        }
    } catch (error) {
        console.error('Error loading projects:', error);
    }
}