const express = require('express');
const { body, validationResult } = require('express-validator');
const { protect, authorize } = require('../middleware/auth');
const User = require('../models/User');
const Restaurant = require('../models/Restaurant');
const Order = require('../models/Order');
const MenuItem = require('../models/MenuItem');

const router = express.Router();

// All routes are admin only
router.use(protect);
router.use(authorize('admin'));

// @desc    Get dashboard statistics
// @route   GET /api/admin/dashboard
// @access  Private (Admin)
router.get('/dashboard', async (req, res) => {
  try {
    const { period = '30' } = req.query; // days
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period));

    // Get overall statistics
    const [
      totalUsers,
      totalRestaurants,
      totalOrders,
      totalRevenue,
      newUsersCount,
      newRestaurantsCount,
      newOrdersCount,
      periodRevenue
    ] = await Promise.all([
      User.countDocuments({ role: 'customer' }),
      Restaurant.countDocuments({ isActive: true }),
      Order.countDocuments(),
      Order.aggregate([
        { $match: { status: 'delivered' } },
        { $group: { _id: null, total: { $sum: '$pricing.total' } } }
      ]),
      User.countDocuments({ role: 'customer', createdAt: { $gte: startDate } }),
      Restaurant.countDocuments({ createdAt: { $gte: startDate } }),
      Order.countDocuments({ createdAt: { $gte: startDate } }),
      Order.aggregate([
        { $match: { status: 'delivered', createdAt: { $gte: startDate } } },
        { $group: { _id: null, total: { $sum: '$pricing.total' } } }
      ])
    ]);

    // Get daily trends
    const dailyTrends = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          orders: { $sum: 1 },
          revenue: { $sum: '$pricing.total' },
          newUsers: { $sum: 0 } // Will be populated separately
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Get user registrations by day
    const dailyUserRegistrations = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
          role: 'customer'
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      }
    ]);

    // Merge user registrations with daily trends
    const userRegMap = dailyUserRegistrations.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {});

    dailyTrends.forEach(day => {
      day.newUsers = userRegMap[day._id] || 0;
    });

    // Get top restaurants
    const topRestaurants = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
          status: 'delivered'
        }
      },
      {
        $group: {
          _id: '$restaurant',
          orderCount: { $sum: 1 },
          revenue: { $sum: '$pricing.total' }
        }
      },
      { $sort: { revenue: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'restaurants',
          localField: '_id',
          foreignField: '_id',
          as: 'restaurant'
        }
      },
      { $unwind: '$restaurant' },
      {
        $project: {
          name: '$restaurant.name',
          logo: '$restaurant.logo',
          orderCount: 1,
          revenue: 1
        }
      }
    ]);

    // Get order status distribution
    const orderStatusDistribution = await Order.aggregate([
      {
        $match: { createdAt: { $gte: startDate } }
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        period: parseInt(period),
        overview: {
          totalUsers,
          totalRestaurants,
          totalOrders,
          totalRevenue: totalRevenue[0]?.total || 0,
          newUsers: newUsersCount,
          newRestaurants: newRestaurantsCount,
          newOrders: newOrdersCount,
          periodRevenue: periodRevenue[0]?.total || 0
        },
        dailyTrends,
        topRestaurants,
        orderStatusDistribution
      }
    });
  } catch (error) {
    console.error('Get admin dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get dashboard data'
    });
  }
});

// @desc    Get all users
// @route   GET /api/admin/users
// @access  Private (Admin)
router.get('/users', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      role,
      search,
      isActive,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build query
    let query = {};
    
    if (role) {
      query.role = role;
    }
    
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    // Build sort options
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const users = await User.find(query)
      .select('-password')
      .sort(sortOptions)
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await User.countDocuments(query);

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get users'
    });
  }
});

// @desc    Get single user
// @route   GET /api/admin/users/:id
// @access  Private (Admin)
router.get('/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get user's order statistics
    const orderStats = await Order.aggregate([
      { $match: { customer: user._id } },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalSpent: { $sum: '$pricing.total' },
          completedOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] }
          }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        user,
        orderStats: orderStats[0] || {
          totalOrders: 0,
          totalSpent: 0,
          completedOrders: 0
        }
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user'
    });
  }
});

// @desc    Update user
// @route   PUT /api/admin/users/:id
// @access  Private (Admin)
router.put('/users/:id', [
  body('role').optional().isIn(['customer', 'restaurant', 'delivery', 'admin']).withMessage('Invalid role'),
  body('isActive').optional().isBoolean().withMessage('isActive must be boolean')
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

    const user = await User.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      message: 'User updated successfully',
      data: { user }
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user'
    });
  }
});

// @desc    Get all restaurants
// @route   GET /api/admin/restaurants
// @access  Private (Admin)
router.get('/restaurants', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search,
      isActive,
      isVerified,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build query
    let query = {};
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }
    
    if (isVerified !== undefined) {
      query.isVerified = isVerified === 'true';
    }

    // Build sort options
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const restaurants = await Restaurant.find(query)
      .populate('owner', 'firstName lastName email')
      .sort(sortOptions)
      .limit(limit * 1)
      .skip((page - 1) * limit);

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

// @desc    Verify restaurant
// @route   PUT /api/admin/restaurants/:id/verify
// @access  Private (Admin)
router.put('/restaurants/:id/verify', async (req, res) => {
  try {
    const restaurant = await Restaurant.findByIdAndUpdate(
      req.params.id,
      { isVerified: true },
      { new: true }
    );

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Restaurant not found'
      });
    }

    res.json({
      success: true,
      message: 'Restaurant verified successfully',
      data: { restaurant }
    });
  } catch (error) {
    console.error('Verify restaurant error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify restaurant'
    });
  }
});

// @desc    Get all orders
// @route   GET /api/admin/orders
// @access  Private (Admin)
router.get('/orders', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      search,
      startDate,
      endDate,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build query
    let query = {};
    
    if (status) {
      query.status = status;
    }
    
    if (search) {
      query.orderNumber = { $regex: search, $options: 'i' };
    }
    
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    // Build sort options
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const orders = await Order.find(query)
      .populate('customer', 'firstName lastName email')
      .populate('restaurant', 'name')
      .sort(sortOptions)
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Order.countDocuments(query);

    res.json({
      success: true,
      data: {
        orders,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get orders'
    });
  }
});

// @desc    Update order status
// @route   PUT /api/admin/orders/:id/status
// @access  Private (Admin)
router.put('/orders/:id/status', [
  body('status').isIn([
    'pending', 'confirmed', 'preparing', 'ready_for_pickup',
    'picked_up', 'on_the_way', 'delivered', 'cancelled', 'refunded'
  ]).withMessage('Invalid status')
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

    const { status, notes } = req.body;
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    order.status = status;
    if (notes) {
      order.restaurantNotes = notes;
    }

    order.timeline.push({
      status,
      message: `Order status updated to ${status} by admin`,
      timestamp: new Date(),
      updatedBy: req.user._id
    });

    await order.save();

    // Emit socket event
    if (req.io) {
      req.io.to(`user_${order.customer}`).emit('order_updated', {
        orderId: order._id,
        status: order.status,
        message: `Your order status has been updated to ${status}`,
        timestamp: new Date()
      });
    }

    res.json({
      success: true,
      message: 'Order status updated successfully',
      data: { order }
    });
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update order status'
    });
  }
});

// @desc    Get system analytics
// @route   GET /api/admin/analytics
// @access  Private (Admin)
router.get('/analytics', async (req, res) => {
  try {
    const { period = '30' } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period));

    // Revenue analytics
    const revenueAnalytics = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
          status: 'delivered'
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          revenue: { $sum: '$pricing.total' },
          orders: { $sum: 1 },
          avgOrderValue: { $avg: '$pricing.total' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // User growth
    const userGrowth = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
          role: 'customer'
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          newUsers: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Restaurant performance
    const restaurantPerformance = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
          status: 'delivered'
        }
      },
      {
        $group: {
          _id: '$restaurant',
          revenue: { $sum: '$pricing.total' },
          orders: { $sum: 1 },
          avgOrderValue: { $avg: '$pricing.total' }
        }
      },
      { $sort: { revenue: -1 } },
      { $limit: 20 },
      {
        $lookup: {
          from: 'restaurants',
          localField: '_id',
          foreignField: '_id',
          as: 'restaurant'
        }
      },
      { $unwind: '$restaurant' },
      {
        $project: {
          name: '$restaurant.name',
          revenue: 1,
          orders: 1,
          avgOrderValue: 1
        }
      }
    ]);

    // Popular menu items
    const popularMenuItems = await Order.aggregate([
      {
        $match: {
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
      { $limit: 20 }
    ]);

    res.json({
      success: true,
      data: {
        period: parseInt(period),
        revenueAnalytics,
        userGrowth,
        restaurantPerformance,
        popularMenuItems
      }
    });
  } catch (error) {
    console.error('Get analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get analytics'
    });
  }
});

module.exports = router;