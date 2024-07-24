from django.shortcuts import render
from .models import Profile, TechSkill, Comment

def index(request):
    profile = Profile.objects.first()
    tech_skills = TechSkill.objects.all()
    comments = Comment.objects.all()
    return render(request, 'index.html', {
        'profile': profile,
        'tech_skills': tech_skills,
        'comments': comments,
    })

def contact(request):
    if request.method == 'POST':
        # Handle form submission here
        pass
    return render(request, 'contact.html')
