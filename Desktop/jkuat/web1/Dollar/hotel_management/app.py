# app.py
from flask import Flask, render_template, request, redirect, url_for
from database import db, init_db, User, Room, Booking

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///hotel.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.secret_key = "your_secret_key"

# Initialize the database
init_db(app)
