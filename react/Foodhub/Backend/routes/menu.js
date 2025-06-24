const express = require('express');
const { body, validationResult } = require('express-validator');
const { protect, authorize } = require('../middleware/auth');
const MenuItem = require('../models/MenuItem');
const Restaurant = require('../models/Restaurant');

const router = express.Router();

// @desc    Get menu items
// @route   GET /api/menu
// @access  Public
router.get('/', async (req, res) => {
  try {
    const {
      restaurant,
      category,
      search,
      minPrice,
      maxPrice,
      dietaryInfo,
      allergens,
      spiceLevel,
      page = 1,
      limit = 20,
      sortBy = 'orderCount'
    } = req.query;

    // Build query
    let query = { isAvailable: true };

    if (restaurant) {
      query.restaurant = restaurant;
    }

    if (category) {
      query.category = category;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { ingredients: { $in: [new RegExp(search, 'i')] } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = parseFloat(minPrice);
      if (maxPrice) query.price.$lte = parseFloat(maxPrice);
    }

    if (dietaryInfo) {
      const dietaryFilters = dietaryInfo.split(',');
      query.dietaryInfo = { $in: dietaryFilters };
    }

    if (allergens) {
      const allergenFilters = allergens.split(',');
      query.allergens = { $nin: allergenFilters }; // Exclude items with these allergens
    }

    if (spiceLevel) {
      query.spiceLevel = spiceLevel;
    }

    // Build sort options
    let sortOptions = {};
    switch (sortBy) {
      case 'price_low':
        sortOptions = { price: 1 };
        break;
      case 'price_high':
        sortOptions = { price: -1 };
        break;
      case 'rating':
        sortOptions = { 'rating.average': -1, 'rating.count': -1 };
        break;
      case 'popular':
        sortOptions = { orderCount: -1 };
        break;
      case 'newest':
        sortOptions = { createdAt: -1 };
        break;
      default:
        sortOptions = { orderCount: -1 };
    }

    const menuItems = await MenuItem.find(query)
      .populate('restaurant', 'name logo deliveryTime deliveryFee')
      .sort(sortOptions)
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await MenuItem.countDocuments(query);

    res.json({
      success: true,
      data: {
        menuItems,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get menu items error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get menu items'
    });
  }
});

// @desc    Get single menu item
// @route   GET /api/menu/:id
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const menuItem = await MenuItem.findById(req.params.id)
      .populate('restaurant', 'name logo phone address deliveryTime deliveryFee');

    if (!menuItem) {
      return res.status(404).json({
        success: false,
        message: 'Menu item not found'
      });
    }

    if (!menuItem.isAvailable) {
      return res.status(404).json({
        success: false,
        message: 'Menu item is not available'
      });
    }

    res.json({
      success: true,
      data: {
        menuItem
      }
    });
  } catch (error) {
    console.error('Get menu item error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get menu item'
    });
  }
});

// @desc    Create menu item
// @route   POST /api/menu
// @access  Private (Restaurant owner/Admin)
router.post('/', protect, authorize('restaurant', 'admin'), [
  body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Menu item name must be between 2 and 100 characters'),
  body('description').trim().isLength({ min: 10, max: 500 }).withMessage('Description must be between 10 and 500 characters'),
  body('restaurant').notEmpty().withMessage('Restaurant ID is required'),
  body('category').isIn([
    'appetizers', 'salads', 'soups', 'main-course', 'pasta', 'pizza', 
    'burgers', 'sandwiches', 'seafood', 'vegetarian', 'vegan', 
    'desserts', 'beverages', 'alcohol', 'sides', 'breakfast', 'specials'
  ]).withMessage('Invalid category'),
  body('price').isNumeric().withMessage('Price must be a number'),
  body('preparationTime').isInt({ min: 1 }).withMessage('Preparation time must be at least 1 minute')
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

    const { restaurant: restaurantId } = req.body;

    // Verify restaurant ownership
    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Restaurant not found'
      });
    }

    if (req.user.role === 'restaurant' && restaurant.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const menuItem = await MenuItem.create(req.body);

    await menuItem.populate('restaurant', 'name logo');

    res.status(201).json({
      success: true,
      message: 'Menu item created successfully',
      data: {
        menuItem
      }
    });
  } catch (error) {
    console.error('Create menu item error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create menu item'
    });
  }
});

// @desc    Update menu item
// @route   PUT /api/menu/:id
// @access  Private (Restaurant owner/Admin)
router.put('/:id', protect, authorize('restaurant', 'admin'), async (req, res) => {
  try {
    const menuItem = await MenuItem.findById(req.params.id).populate('restaurant');

    if (!menuItem) {
      return res.status(404).json({
        success: false,
        message: 'Menu item not found'
      });
    }

    // Check ownership
    if (req.user.role === 'restaurant' && menuItem.restaurant.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const updatedMenuItem = await MenuItem.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('restaurant', 'name logo');

    res.json({
      success: true,
      message: 'Menu item updated successfully',
      data: {
        menuItem: updatedMenuItem
      }
    });
  } catch (error) {
    console.error('Update menu item error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update menu item'
    });
  }
});

// @desc    Delete menu item
// @route   DELETE /api/menu/:id
// @access  Private (Restaurant owner/Admin)
router.delete('/:id', protect, authorize('restaurant', 'admin'), async (req, res) => {
  try {
    const menuItem = await MenuItem.findById(req.params.id).populate('restaurant');

    if (!menuItem) {
      return res.status(404).json({
        success: false,
        message: 'Menu item not found'
      });
    }

    // Check ownership
    if (req.user.role === 'restaurant' && menuItem.restaurant.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Soft delete - just mark as unavailable
    menuItem.isAvailable = false;
    await menuItem.save();

    res.json({
      success: true,
      message: 'Menu item deleted successfully'
    });
  } catch (error) {
    console.error('Delete menu item error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete menu item'
    });
  }
});

// @desc    Toggle menu item availability
// @route   PUT /api/menu/:id/toggle-availability
// @access  Private (Restaurant owner)
router.put('/:id/toggle-availability', protect, authorize('restaurant'), async (req, res) => {
  try {
    const menuItem = await MenuItem.findById(req.params.id).populate('restaurant');

    if (!menuItem) {
      return res.status(404).json({
        success: false,
        message: 'Menu item not found'
      });
    }

    // Check ownership
    if (menuItem.restaurant.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    menuItem.isAvailable = !menuItem.isAvailable;
    await menuItem.save();

    res.json({
      success: true,
      message: `Menu item is now ${menuItem.isAvailable ? 'available' : 'unavailable'}`,
      data: {
        isAvailable: menuItem.isAvailable
      }
    });
  } catch (error) {
    console.error('Toggle menu item availability error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle menu item availability'
    });
  }
});

// @desc    Get menu categories
// @route   GET /api/menu/meta/categories
// @access  Public
router.get('/meta/categories', async (req, res) => {
  try {
    const { restaurant } = req.query;
    
    let query = { isAvailable: true };
    if (restaurant) {
      query.restaurant = restaurant;
    }

    const categories = await MenuItem.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          avgPrice: { $avg: '$price' }
        }
      },
      { $sort: { count: -1 } }
    ]);

    res.json({
      success: true,
      data: {
        categories: categories.map(cat => ({
          name: cat._id,
          count: cat.count,
          avgPrice: Math.round(cat.avgPrice * 100) / 100
        }))
      }
    });
  } catch (error) {
    console.error('Get menu categories error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get menu categories'
    });
  }
});

// @desc    Get popular menu items
// @route   GET /api/menu/popular
// @access  Public
router.get('/popular', async (req, res) => {
  try {
    const { limit = 10, restaurant } = req.query;
    
    let query = { isAvailable: true };
    if (restaurant) {
      query.restaurant = restaurant;
    }

    const popularItems = await MenuItem.find(query)
      .populate('restaurant', 'name logo')
      .sort({ orderCount: -1, 'rating.average': -1 })
      .limit(parseInt(limit));

    res.json({
      success: true,
      data: {
        popularItems
      }
    });
  } catch (error) {
    console.error('Get popular menu items error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get popular menu items'
    });
  }
});

// @desc    Search menu items
// @route   GET /api/menu/search
// @access  Public
router.get('/search', async (req, res) => {
  try {
    const { q, lat, lng, radius = 10, limit = 20 } = req.query;

    if (!q) {
      return res.status(400).json({
        success: false,
        message: 'Search query is required'
      });
    }

    // Build restaurant query for location-based search
    let restaurantQuery = {
      isActive: true,
      isVerified: true
    };

    if (lat && lng) {
      restaurantQuery['address.coordinates'] = {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(lng), parseFloat(lat)]
          },
          $maxDistance: radius * 1000
        }
      };
    }

    // Get restaurants in the area
    const restaurants = await Restaurant.find(restaurantQuery).select('_id');
    const restaurantIds = restaurants.map(r => r._id);

    // Search menu items
    const menuItems = await MenuItem.find({
      isAvailable: true,
      restaurant: { $in: restaurantIds },
      $or: [
        { name: { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } },
        { ingredients: { $in: [new RegExp(q, 'i')] } },
        { tags: { $in: [new RegExp(q, 'i')] } }
      ]
    })
    .populate('restaurant', 'name logo address deliveryTime deliveryFee')
    .sort({ orderCount: -1, 'rating.average': -1 })
    .limit(parseInt(limit));

    // Also search restaurants
    const matchingRestaurants = await Restaurant.find({
      ...restaurantQuery,
      $or: [
        { name: { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } },
        { cuisine: { $in: [new RegExp(q, 'i')] } },
        { tags: { $in: [new RegExp(q, 'i')] } }
      ]
    })
    .select('name description cuisine rating logo images')
    .limit(10);

    res.json({
      success: true,
      data: {
        query: q,
        menuItems,
        restaurants: matchingRestaurants,
        location: lat && lng ? { lat: parseFloat(lat), lng: parseFloat(lng) } : null
      }
    });
  } catch (error) {
    console.error('Search menu items error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search menu items'
    });
  }
});

module.exports = router;