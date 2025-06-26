const express = require('express');
const { body, validationResult } = require('express-validator');
const { protect } = require('../middleware/auth');
const User = require('../models/User');
const Order = require('../models/Order');

const router = express.Router();

// @desc    Update user profile
// @route   PUT /api/users/profile
// @access  Private
router.put('/profile', protect, [
  body('firstName').optional().trim().isLength({ min: 2, max: 50 }).withMessage('First name must be between 2 and 50 characters'),
  body('lastName').optional().trim().isLength({ min: 2, max: 50 }).withMessage('Last name must be between 2 and 50 characters'),
  body('phone').optional().matches(/^\+?[\d\s-()]+$/).withMessage('Please provide a valid phone number')
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

    const { firstName, lastName, phone, avatar } = req.body;

    const user = await User.findByIdAndUpdate(
      req.user._id,
      {
        ...(firstName && { firstName }),
        ...(lastName && { lastName }),
        ...(phone && { phone }),
        ...(avatar && { avatar })
      },
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          fullName: user.fullName,
          email: user.email,
          phone: user.phone,
          avatar: user.avatar,
          role: user.role
        }
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile'
    });
  }
});

// @desc    Add address
// @route   POST /api/users/addresses
// @access  Private
router.post('/addresses', protect, [
  body('street').notEmpty().withMessage('Street address is required'),
  body('city').notEmpty().withMessage('City is required'),
  body('state').notEmpty().withMessage('State is required'),
  body('zipCode').notEmpty().withMessage('ZIP code is required'),
  body('coordinates').optional().isObject().withMessage('Coordinates must be an object')
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

    const user = await User.findById(req.user._id);
    const { isDefault = false, ...addressData } = req.body;

    // If this is set as default, make others non-default
    if (isDefault) {
      user.addresses.forEach(addr => {
        addr.isDefault = false;
      });
    }

    // If this is the first address, make it default
    const newAddress = {
      ...addressData,
      isDefault: isDefault || user.addresses.length === 0
    };

    user.addresses.push(newAddress);
    await user.save();

    res.status(201).json({
      success: true,
      message: 'Address added successfully',
      data: {
        address: user.addresses[user.addresses.length - 1]
      }
    });
  } catch (error) {
    console.error('Add address error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add address'
    });
  }
});

// @desc    Update address
// @route   PUT /api/users/addresses/:addressId
// @access  Private
router.put('/addresses/:addressId', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const address = user.addresses.id(req.params.addressId);

    if (!address) {
      return res.status(404).json({
        success: false,
        message: 'Address not found'
      });
    }

    const { isDefault, ...updateData } = req.body;

    // Update address fields
    Object.keys(updateData).forEach(key => {
      address[key] = updateData[key];
    });

    // Handle default address change
    if (isDefault !== undefined) {
      if (isDefault) {
        // Make this address default and others non-default
        user.addresses.forEach(addr => {
          addr.isDefault = addr._id.toString() === req.params.addressId;
        });
      } else {
        address.isDefault = false;
        // If this was the only default, make the first address default
        if (!user.addresses.some(addr => addr.isDefault)) {
          user.addresses[0].isDefault = true;
        }
      }
    }

    await user.save();

    res.json({
      success: true,
      message: 'Address updated successfully',
      data: {
        address
      }
    });
  } catch (error) {
    console.error('Update address error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update address'
    });
  }
});

// @desc    Delete address
// @route   DELETE /api/users/addresses/:addressId
// @access  Private
router.delete('/addresses/:addressId', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const address = user.addresses.id(req.params.addressId);

    if (!address) {
      return res.status(404).json({
        success: false,
        message: 'Address not found'
      });
    }

    const wasDefault = address.isDefault;
    address.remove();

    // If the deleted address was default, make the first remaining address default
    if (wasDefault && user.addresses.length > 0) {
      user.addresses[0].isDefault = true;
    }

    await user.save();

    res.json({
      success: true,
      message: 'Address deleted successfully'
    });
  } catch (error) {
    console.error('Delete address error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete address'
    });
  }
});

// @desc    Get user addresses
// @route   GET /api/users/addresses
// @access  Private
router.get('/addresses', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('addresses');

    res.json({
      success: true,
      data: {
        addresses: user.addresses
      }
    });
  } catch (error) {
    console.error('Get addresses error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get addresses'
    });
  }
});

// @desc    Update user preferences
// @route   PUT /api/users/preferences
// @access  Private
router.put('/preferences', protect, [
  body('cuisine').optional().isArray().withMessage('Cuisine must be an array'),
  body('dietaryRestrictions').optional().isArray().withMessage('Dietary restrictions must be an array'),
  body('notifications').optional().isObject().withMessage('Notifications must be an object')
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

    const user = await User.findById(req.user._id);
    
    // Update preferences
    if (req.body.cuisine !== undefined) {
      user.preferences.cuisine = req.body.cuisine;
    }
    
    if (req.body.dietaryRestrictions !== undefined) {
      user.preferences.dietaryRestrictions = req.body.dietaryRestrictions;
    }
    
    if (req.body.notifications !== undefined) {
      user.preferences.notifications = {
        ...user.preferences.notifications,
        ...req.body.notifications
      };
    }

    await user.save();

    res.json({
      success: true,
      message: 'Preferences updated successfully',
      data: {
        preferences: user.preferences
      }
    });
  } catch (error) {
    console.error('Update preferences error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update preferences'
    });
  }
});

// @desc    Get user statistics
// @route   GET /api/users/stats
// @access  Private
router.get('/stats', protect, async (req, res) => {
  try {
    const userId = req.user._id;

    // Get order statistics
    const orderStats = await Order.aggregate([
      { $match: { customer: userId } },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalSpent: { $sum: '$pricing.total' },
          completedOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] }
          },
          cancelledOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] }
          },
          averageOrderValue: { $avg: '$pricing.total' }
        }
      }
    ]);

    // Get favorite restaurants (most ordered from)
    const favoriteRestaurants = await Order.aggregate([
      { $match: { customer: userId, status: 'delivered' } },
      {
        $group: {
          _id: '$restaurant',
          orderCount: { $sum: 1 },
          totalSpent: { $sum: '$pricing.total' }
        }
      },
      { $sort: { orderCount: -1 } },
      { $limit: 5 },
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
          totalSpent: 1
        }
      }
    ]);

    // Get recent orders
    const recentOrders = await Order.find({ customer: userId })
      .populate('restaurant', 'name logo')
      .select('orderNumber status pricing.total createdAt')
      .sort({ createdAt: -1 })
      .limit(5);

    // Get monthly spending trend (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const monthlySpending = await Order.aggregate([
      {
        $match: {
          customer: userId,
          createdAt: { $gte: sixMonthsAgo },
          status: 'delivered'
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          totalSpent: { $sum: '$pricing.total' },
          orderCount: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    res.json({
      success: true,
      data: {
        orderStats: orderStats[0] || {
          totalOrders: 0,
          totalSpent: 0,
          completedOrders: 0,
          cancelledOrders: 0,
          averageOrderValue: 0
        },
        favoriteRestaurants,
        recentOrders,
        monthlySpending
      }
    });
  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user statistics'
    });
  }
});

// @desc    Deactivate account
// @route   PUT /api/users/deactivate
// @access  Private
router.put('/deactivate', protect, [
  body('reason').optional().isString().withMessage('Reason must be a string')
], async (req, res) => {
  try {
    const { reason } = req.body;
    
    const user = await User.findById(req.user._id);
    user.isActive = false;
    
    // You might want to store the deactivation reason
    // user.deactivationReason = reason;
    // user.deactivatedAt = new Date();
    
    await user.save();

    res.json({
      success: true,
      message: 'Account deactivated successfully'
    });
  } catch (error) {
    console.error('Deactivate account error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to deactivate account'
    });
  }
});

// @desc    Get user order history
// @route   GET /api/users/order-history
// @access  Private
router.get('/order-history', protect, async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    
    let query = { customer: req.user._id };
    if (status) {
      query.status = status;
    }

    const orders = await Order.find(query)
      .populate('restaurant', 'name logo')
      .populate('items.menuItem', 'name images')
      .select('orderNumber status pricing createdAt items rating')
      .sort({ createdAt: -1 })
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
    console.error('Get order history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get order history'
    });
  }
});

// @desc    Upload avatar
// @route   POST /api/users/avatar
// @access  Private
router.post('/avatar', protect, async (req, res) => {
  try {
    const { avatar } = req.body;

    if (!avatar) {
      return res.status(400).json({
        success: false,
        message: 'Avatar URL is required'
      });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { avatar },
      { new: true }
    );

    res.json({
      success: true,
      message: 'Avatar updated successfully',
      data: {
        avatar: user.avatar
      }
    });
  } catch (error) {
    console.error('Upload avatar error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update avatar'
    });
  }
});

module.exports = router;