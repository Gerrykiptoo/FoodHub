const jwt = require('jsonwebtoken');
const User = require('../models/User');

const socketAuth = async (socket, next) => {
  try {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];

    if (!token) {
      return next(new Error('Authentication error: No token provided'));
    }

    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Get user from token
      const user = await User.findById(decoded.id).select('-password');
      
      if (!user) {
        return next(new Error('Authentication error: User not found'));
      }

      if (!user.isActive) {
        return next(new Error('Authentication error: Account deactivated'));
      }

      // Attach user info to socket
      socket.userId = user._id.toString();
      socket.userRole = user.role;
      socket.user = user;

      // If user is a restaurant owner, get their restaurant ID
      if (user.role === 'restaurant') {
        const Restaurant = require('../models/Restaurant');
        const restaurant = await Restaurant.findOne({ owner: user._id });
        if (restaurant) {
          socket.restaurantId = restaurant._id.toString();
        }
      }

      next();
    } catch (error) {
      
      return next(new Error('Authentication error: Invalid token'));
    }
  } catch (error) {
    console.error('Socket auth error:', error);
    return next(new Error('Authentication error: Server error'));
  }
};

module.exports = { socketAuth };