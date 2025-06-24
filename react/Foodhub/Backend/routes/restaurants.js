const express = require('express');
const { body, validationResult } = require('express-validator');
const { protect, authorize, optionalAuth } = require('../middleware/auth');
const Restaurant = require('../models/Restaurant');
const MenuItem = require('../models/MenuItem');
const Order = require('../models/Order');

const router = express.Router();

// @desc    Get all restaurants
// @route   GET /api/restaurants
// @access  Public
router.get('/', optionalAuth, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 12,
      cuisine,
      priceRange,
      rating,
      search,
      lat,
      lng,
      radius = 10,
      sortBy = 'rating',
      isOpen
    } = req.query;

    // Build query
    let query = {
      isActive: true,
      isVerified: true
    };

    // Search filter
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { cuisine: { $in: [new RegExp(search, 'i')] } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    // Cuisine filter
    if (cuisine) {
      const cuisines = cuisine.split(',');
      query.cuisine = { $in: cuisines };
    }

    // Price range filter
    if (priceRange) {
      const priceRanges = priceRange.split(',');
      query.priceRange = { $in: priceRanges };
    }

    // Rating filter
    if (rating) {
      query['rating.average'] = { $gte: parseFloat(rating) };
    }

    // Location-based query
    if (lat && lng) {
      query['address.coordinates'] = {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(lng), parseFloat(lat)]
          },
          $maxDistance: radius * 1000 // Convert km to meters
        }
      };
    }

    // Build sort options
    let sortOptions = {};
    switch (sortBy) {
      case 'rating':
        sortOptions = { 'rating.average': -1, 'rating.count': -1 };
        break;
      case 'deliveryTime':
        sortOptions = { 'deliveryTime.min': 1 };
        break;
      case 'deliveryFee':
        sortOptions = { deliveryFee: 1 };
        break;
      case 'distance':
        // Distance sorting is handled by $near in the query
        sortOptions = {};
        break;
      case 'newest':
        sortOptions = { createdAt: -1 };
        break;
      default:
        sortOptions = { 'rating.average': -1 };
    }

    // Execute query
    let restaurants = await Restaurant.find(query)
      .select('-owner -stripeAccountId')
      .sort(sortOptions)
      .limit(limit * 1)
      .skip((page - 1) * limit);

    // Filter by open status if requested
    if (isOpen === 'true') {
      restaurants = restaurants.filter(restaurant => restaurant.isCurrentlyOpen());
    }

    // Calculate distance if coordinates provided
    if (lat && lng) {
      restaurants = restaurants.map(restaurant => {
        const distance = restaurant.distanceFrom(parseFloat(lat), parseFloat(lng));
        return {
          ...restaurant.toObject(),
          distance: Math.round(distance * 10) / 10 // Round to 1 decimal place
        };
      });
    }

    const total = await Restaurant.countDocuments(query);

    res.json({
      success: true,
      data: {
        restaurants,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        },
        filters: {
          cuisine,
          priceRange,
          rating,
          search,
          location: lat && lng ? { lat: parseFloat(lat), lng: parseFloat(lng) } : null
        }
      }
    });
  } catch (error) {
    console.error('Get restaurants error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get restaurants'
    });
  }
});

// @desc    Get single restaurant
// @route   GET /api/restaurants/:id
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const restaurant = await Restaurant.findById(req.params.id)
      .select('-owner -stripeAccountId');

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Restaurant not found'
      });
    }

    if (!restaurant.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Restaurant is not available'
      });
    }

    // Get menu items
    const menuItems = await MenuItem.find({
      restaurant: restaurant._id,
      isAvailable: true
    }).sort({ category: 1, orderCount: -1 });

    // Group menu items by category
    const menuByCategory = menuItems.reduce((acc, item) => {
      if (!acc[item.category]) {
        acc[item.category] = [];
      }
      acc[item.category].push(item);
      return acc;
    }, {});

    // Get recent reviews (from orders)
    const recentOrders = await Order.find({
      restaurant: restaurant._id,
      'rating.ratedAt': { $exists: true }
    })
    .populate('customer', 'firstName lastName')
    .select('rating createdAt')
    .sort({ 'rating.ratedAt': -1 })
    .limit(10);

    const reviews = recentOrders.map(order => ({
      customer: `${order.customer.firstName} ${order.customer.lastName[0]}.`,
      rating: order.rating,
      date: order.rating.ratedAt
    }));

    res.json({
      success: true,
      data: {
        restaurant: {
          ...restaurant.toObject(),
          isCurrentlyOpen: restaurant.isCurrentlyOpen()
        },
        menu: menuByCategory,
        reviews
      }
    });
  } catch (error) {
    console.error('Get restaurant error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get restaurant'
    });
  }
});

// @desc    Create restaurant
// @route   POST /api/restaurants
// @access  Private (Restaurant owners)
router.post('/', protect, authorize('restaurant', 'admin'), [
  body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Restaurant name must be between 2 and 100 characters'),
  body('description').trim().isLength({ min: 10, max: 500 }).withMessage('Description must be between 10 and 500 characters'),
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email'),
  body('phone').matches(/^\+?[\d\s-()]+$/).withMessage('Please provide a valid phone number'),
  body('address').isObject().withMessage('Address is required'),
  body('cuisine').isArray({ min: 1 }).withMessage('At least one cuisine type is required'),
  body('priceRange').isIn(['$', '$$', '$$$', '$$$$']).withMessage('Invalid price range'),
  body('deliveryFee').isNumeric().withMessage('Delivery fee must be a number'),
  body('minimumOrder').isNumeric().withMessage('Minimum order must be a number'),
  body('deliveryTime').isObject().withMessage('Delivery time is required'),
  body('deliveryRadius').isNumeric().withMessage('Delivery radius must be a number')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    // Check if user already has a restaurant
    const existingRestaurant = await Restaurant.findOne({ owner: req.user._id });
    if (existingRestaurant) {
      return res.status(400).json({
        success: false,
        message: 'You already have a restaurant registered'
      });
    }

    const restaurantData = {
      ...req.body,
      owner: req.user._id
    };

    const restaurant = await Restaurant.create(restaurantData);

    res.status(201).json({
      success: true,
      message: 'Restaurant created successfully. It will be reviewed before going live.',
      data: {
        restaurant
      }
    });
  } catch (error) {
    console.error('Create restaurant error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create restaurant'
    });
  }
});

// @desc    Update restaurant
// @route   PUT /api/restaurants/:id
// @access  Private (Restaurant owner/Admin)
router.put('/:id', protect, authorize('restaurant', 'admin'), async (req, res) => {
  try {
    const restaurant = await Restaurant.findById(req.params.id);

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Restaurant not found'
      });
    }

    // Check ownership
    if (req.user.role === 'restaurant' && restaurant.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Update restaurant
    const updatedRestaurant = await Restaurant.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: 'Restaurant updated successfully',
      data: {
        restaurant: updatedRestaurant
      }
    });
  } catch (error) {
    console.error('Update restaurant error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update restaurant'
    });
  }
});

// @desc    Delete restaurant
// @route   DELETE /api/restaurants/:id
// @access  Private (Restaurant owner/Admin)
router.delete('/:id', protect, authorize('restaurant', 'admin'), async (req, res) => {
  try {
    const restaurant = await Restaurant.findById(req.params.id);

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Restaurant not found'
      });
    }

    // Check ownership
    if (req.user.role === 'restaurant' && restaurant.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Soft delete - just deactivate
    restaurant.isActive = false;
    await restaurant.save();

    res.json({
      success: true,
      message: 'Restaurant deactivated successfully'
    });
  } catch (error) {
    console.error('Delete restaurant error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete restaurant'
    });
  }
});

// @desc    Get restaurant analytics
// @route   GET /api/restaurants/:id/analytics
// @access  Private (Restaurant owner/Admin)
router.get('/:id/analytics', protect, authorize('restaurant', 'admin'), async (req, res) => {
  try {
    const { period = '30' } = req.query; // days
    const restaurant = await Restaurant.findById(req.params.id);

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Restaurant not found'
      });
    }

    // Check ownership
    if (req.user.role === 'restaurant' && restaurant.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period));

    // Get order analytics
    const orderStats = await Order.aggregate([
      {
        $match: {
          restaurant: restaurant._id,
          createdAt: { $gte: startDate },
          status: { $ne: 'cancelled' }
        }
      },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalRevenue: { $sum: '$pricing.total' },
          averageOrderValue: { $avg: '$pricing.total' },
          completedOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] }
          }
        }
      }
    ]);

    // Get daily order trends
    const dailyTrends = await Order.aggregate([
      {
        $match: {
          restaurant: restaurant._id,
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          orders: { $sum: 1 },
          revenue: { $sum: '$pricing.total' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Get popular menu items
    const popularItems = await Order.aggregate([
      {
        $match: {
          restaurant: restaurant._id,
          createdAt: { $gte: startDate },
          status: 'delivered'
        }
      },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.menuItem',
          name: { $first: '$items.name' },
          orderCount: { $sum: '$items.quantity' },
          revenue: { $sum: '$items.subtotal' }
        }
      },
      { $sort: { orderCount: -1 } },
      { $limit: 10 }
    ]);

    // Get customer ratings
    const ratingStats = await Order.aggregate([
      {
        $match: {
          restaurant: restaurant._id,
          'rating.ratedAt': { $exists: true }
        }
      },
      {
        $group: {
          _id: null,
          averageRating: { $avg: '$rating.overall' },
          totalRatings: { $sum: 1 },
          fiveStars: { $sum: { $cond: [{ $eq: ['$rating.overall', 5] }, 1, 0] } },
          fourStars: { $sum: { $cond: [{ $eq: ['$rating.overall', 4] }, 1, 0] } },
          threeStars: { $sum: { $cond: [{ $eq: ['$rating.overall', 3] }, 1, 0] } },
          twoStars: { $sum: { $cond: [{ $eq: ['$rating.overall', 2] }, 1, 0] } },
          oneStar: { $sum: { $cond: [{ $eq: ['$rating.overall', 1] }, 1, 0] } }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        period: parseInt(period),
        orderStats: orderStats[0] || {
          totalOrders: 0,
          totalRevenue: 0,
          averageOrderValue: 0,
          completedOrders: 0
        },
        dailyTrends,
        popularItems,
        ratingStats: ratingStats[0] || {
          averageRating: 0,
          totalRatings: 0,
          fiveStars: 0,
          fourStars: 0,
          threeStars: 0,
          twoStars: 0,
          oneStar: 0
        }
      }
    });
  } catch (error) {
    console.error('Get restaurant analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get restaurant analytics'
    });
  }
});

// @desc    Toggle restaurant open/closed status
// @route   PUT /api/restaurants/:id/toggle-status
// @access  Private (Restaurant owner)
router.put('/:id/toggle-status', protect, authorize('restaurant'), async (req, res) => {
  try {
    const restaurant = await Restaurant.findById(req.params.id);

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Restaurant not found'
      });
    }

    // Check ownership
    if (restaurant.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    restaurant.isOpen = !restaurant.isOpen;
    await restaurant.save();

    res.json({
      success: true,
      message: `Restaurant is now ${restaurant.isOpen ? 'open' : 'closed'}`,
      data: {
        isOpen: restaurant.isOpen
      }
    });
  } catch (error) {
    console.error('Toggle restaurant status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle restaurant status'
    });
  }
});

// @desc    Get cuisines list
// @route   GET /api/restaurants/cuisines
// @access  Public
router.get('/meta/cuisines', async (req, res) => {
  try {
    const cuisines = await Restaurant.distinct('cuisine', {
      isActive: true,
      isVerified: true
    });

    // Get cuisine counts
    const cuisineCounts = await Restaurant.aggregate([
      {
        $match: { isActive: true, isVerified: true }
      },
      { $unwind: '$cuisine' },
      {
        $group: {
          _id: '$cuisine',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    res.json({
      success: true,
      data: {
        cuisines: cuisineCounts.map(c => ({
          name: c._id,
          count: c.count
        }))
      }
    });
  } catch (error) {
    console.error('Get cuisines error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get cuisines'
    });
  }
});

module.exports = router;