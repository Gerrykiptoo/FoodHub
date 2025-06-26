const express = require('express');
const { body, validationResult } = require('express-validator');
const { protect, authorize } = require('../middleware/auth');
const Order = require('../models/Order');
const MenuItem = require('../models/MenuItem');
const Restaurant = require('../models/Restaurant');
const User = require('../models/User');

const router = express.Router();

// @desc    Create new order
// @route   POST /api/orders
// @access  Private
router.post('/', protect, [
  body('restaurant').notEmpty().withMessage('Restaurant ID is required'),
  body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
  body('orderType').isIn(['delivery', 'pickup']).withMessage('Invalid order type'),
  body('deliveryAddress').if(body('orderType').equals('delivery')).notEmpty().withMessage('Delivery address is required for delivery orders')
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

    const {
      restaurant: restaurantId,
      items,
      orderType,
      deliveryAddress,
      customerNotes,
      scheduledFor,
      promoCode
    } = req.body;

    // Validate restaurant
    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant || !restaurant.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Restaurant not found or inactive'
      });
    }

    // Check if restaurant is open
    if (!restaurant.isCurrentlyOpen()) {
      return res.status(400).json({
        success: false,
        message: 'Restaurant is currently closed'
      });
    }

    // Validate delivery address if delivery order
    if (orderType === 'delivery') {
      if (!deliveryAddress || !deliveryAddress.coordinates) {
        return res.status(400).json({
          success: false,
          message: 'Valid delivery address with coordinates is required'
        });
      }

      // Check if restaurant delivers to this location
      const { lat, lng } = deliveryAddress.coordinates;
      if (!restaurant.deliversTo(lat, lng)) {
        return res.status(400).json({
          success: false,
          message: 'Restaurant does not deliver to this location'
        });
      }
    }

    // Validate and calculate items
    let subtotal = 0;
    let totalPreparationTime = 0;
    const validatedItems = [];

    for (const item of items) {
      const menuItem = await MenuItem.findById(item.menuItem);
      
      if (!menuItem || !menuItem.isAvailable) {
        return res.status(400).json({
          success: false,
          message: `Menu item ${item.name || 'unknown'} is not available`
        });
      }

      if (menuItem.restaurant.toString() !== restaurantId) {
        return res.status(400).json({
          success: false,
          message: `Menu item ${menuItem.name} does not belong to this restaurant`
        });
      }

      // Calculate item price with customizations
      const itemPrice = menuItem.calculatePrice(item.customizations || []);
      const itemSubtotal = itemPrice * item.quantity;

      validatedItems.push({
        menuItem: menuItem._id,
        name: menuItem.name,
        price: itemPrice,
        quantity: item.quantity,
        customizations: item.customizations || [],
        specialInstructions: item.specialInstructions || '',
        subtotal: itemSubtotal
      });

      subtotal += itemSubtotal;
      totalPreparationTime = Math.max(totalPreparationTime, menuItem.preparationTime);
    }

    // Check minimum order amount
    if (subtotal < restaurant.minimumOrder) {
      return res.status(400).json({
        success: false,
        message: `Minimum order amount is $${restaurant.minimumOrder}`
      });
    }

    // Calculate pricing
    const tax = subtotal * 0.08; // 8% tax
    const deliveryFee = orderType === 'delivery' ? restaurant.deliveryFee : 0;
    const serviceFee = subtotal * 0.02; // 2% service fee
    let discount = 0;

    // Apply promo code if provided
    if (promoCode) {
      // Simple promo code logic - in production, you'd have a PromoCode model
      if (promoCode.code === 'WELCOME10') {
        discount = subtotal * 0.1; // 10% discount
      }
    }

    const total = subtotal + tax + deliveryFee + serviceFee - discount;

    // Create order
    const order = new Order({
      customer: req.user._id,
      restaurant: restaurantId,
      items: validatedItems,
      orderType,
      deliveryAddress: orderType === 'delivery' ? deliveryAddress : undefined,
      pricing: {
        subtotal,
        tax,
        deliveryFee,
        serviceFee,
        discount,
        total
      },
      payment: {
        method: 'card', // Default to card, will be updated during payment
        status: 'pending'
      },
      estimatedPreparationTime: totalPreparationTime,
      customerNotes,
      promoCode,
      isScheduled: !!scheduledFor,
      scheduledFor: scheduledFor ? new Date(scheduledFor) : undefined
    });

    // Calculate estimated delivery time
    order.estimatedDeliveryTime = order.calculateEstimatedDeliveryTime();

    await order.save();

    // Populate order for response
    await order.populate([
      { path: 'restaurant', select: 'name logo phone address' },
      { path: 'items.menuItem', select: 'name images' }
    ]);

    // Emit socket event to restaurant
    if (req.io) {
      req.io.to(`restaurant_${restaurantId}`).emit('new_order', {
        orderId: order._id,
        orderNumber: order.orderNumber,
        customer: {
          name: req.user.fullName,
          phone: req.user.phone
        },
        total: order.pricing.total,
        estimatedPreparationTime: order.estimatedPreparationTime
      });
    }

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: {
        order
      }
    });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create order'
    });
  }
});

// @desc    Get user orders
// @route   GET /api/orders
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    
    const query = { customer: req.user._id };
    if (status) {
      query.status = status;
    }

    const orders = await Order.find(query)
      .populate('restaurant', 'name logo phone address')
      .populate('items.menuItem', 'name images')
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
    console.error('Get orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get orders'
    });
  }
});

// @desc    Get single order
// @route   GET /api/orders/:id
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('customer', 'firstName lastName phone email')
      .populate('restaurant', 'name logo phone address')
      .populate('items.menuItem', 'name images description')
      .populate('deliveryTracking.deliveryPerson', 'firstName lastName phone');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check if user can access this order
    const canAccess = order.customer._id.toString() === req.user._id.toString() ||
                     (req.user.role === 'restaurant' && order.restaurant._id.toString() === req.user.restaurantId) ||
                     (req.user.role === 'delivery' && order.deliveryTracking.deliveryPerson?._id.toString() === req.user._id.toString()) ||
                     req.user.role === 'admin';

    if (!canAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    res.json({
      success: true,
      data: {
        order
      }
    });
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get order'
    });
  }
});

// @desc    Update order status (Restaurant/Admin)
// @route   PUT /api/orders/:id/status
// @access  Private (Restaurant/Admin)
router.put('/:id/status', protect, authorize('restaurant', 'admin'), [
  body('status').isIn(['confirmed', 'preparing', 'ready_for_pickup', 'cancelled']).withMessage('Invalid status')
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

    // Check if restaurant owns this order
    if (req.user.role === 'restaurant') {
      const restaurant = await Restaurant.findOne({ owner: req.user._id });
      if (!restaurant || order.restaurant.toString() !== restaurant._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }
    }

    // Update order status
    order.status = status;
    if (notes) {
      order.restaurantNotes = notes;
    }

    // Add timeline entry
    order.timeline.push({
      status,
      message: `Order status updated to ${status}`,
      timestamp: new Date(),
      updatedBy: req.user._id
    });

    await order.save();

    // Emit socket event to customer
    if (req.io) {
      req.io.to(`user_${order.customer}`).emit('order_updated', {
        orderId: order._id,
        status: order.status,
        message: `Your order is now ${status}`,
        timestamp: new Date()
      });

      // If order is ready for pickup, notify delivery personnel
      if (status === 'ready_for_pickup' && order.orderType === 'delivery') {
        req.io.to('delivery_personnel').emit('order_ready_for_pickup', {
          orderId: order._id,
          orderNumber: order.orderNumber,
          restaurant: {
            name: order.restaurant.name,
            address: order.restaurant.address
          },
          deliveryAddress: order.deliveryAddress
        });
      }
    }

    res.json({
      success: true,
      message: 'Order status updated successfully',
      data: {
        order: {
          id: order._id,
          status: order.status,
          timeline: order.timeline
        }
      }
    });
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update order status'
    });
  }
});

// @desc    Assign delivery person
// @route   PUT /api/orders/:id/assign-delivery
// @access  Private (Admin/Delivery)
router.put('/:id/assign-delivery', protect, authorize('admin', 'delivery'), async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (order.orderType !== 'delivery') {
      return res.status(400).json({
        success: false,
        message: 'This is not a delivery order'
      });
    }

    if (order.status !== 'ready_for_pickup') {
      return res.status(400).json({
        success: false,
        message: 'Order is not ready for pickup'
      });
    }

    // Assign delivery person
    order.deliveryTracking.deliveryPerson = req.user._id;
    order.deliveryTracking.status = 'assigned';
    order.status = 'picked_up';

    // Calculate estimated delivery time
    const now = new Date();
    order.deliveryTracking.estimatedDeliveryTime = new Date(now.getTime() + 20 * 60000); // 20 minutes

    order.timeline.push({
      status: 'assigned_delivery',
      message: 'Delivery person assigned',
      timestamp: new Date(),
      updatedBy: req.user._id
    });

    await order.save();

    // Emit socket events
    if (req.io) {
      req.io.to(`user_${order.customer}`).emit('delivery_assigned', {
        orderId: order._id,
        deliveryPerson: {
          name: req.user.fullName,
          phone: req.user.phone
        },
        estimatedDeliveryTime: order.deliveryTracking.estimatedDeliveryTime
      });

      req.io.to(`user_${req.user._id}`).emit('delivery_assigned_to_you', {
        orderId: order._id,
        orderNumber: order.orderNumber,
        customer: order.customer,
        deliveryAddress: order.deliveryAddress
      });
    }

    res.json({
      success: true,
      message: 'Delivery person assigned successfully'
    });
  } catch (error) {
    console.error('Assign delivery error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to assign delivery person'
    });
  }
});

// @desc    Update delivery status
// @route   PUT /api/orders/:id/delivery-status
// @access  Private (Delivery)
router.put('/:id/delivery-status', protect, authorize('delivery'), [
  body('status').isIn(['picked_up', 'on_the_way', 'delivered']).withMessage('Invalid delivery status')
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

    const { status, location, notes, deliveryPhoto } = req.body;
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check if this delivery person is assigned to this order
    if (order.deliveryTracking.deliveryPerson.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You are not assigned to this order'
      });
    }

    // Update delivery status
    order.deliveryTracking.status = status;
    order.status = status;

    if (location) {
      order.deliveryTracking.currentLocation = {
        lat: location.lat,
        lng: location.lng,
        timestamp: new Date()
      };
    }

    if (notes) {
      order.deliveryTracking.deliveryNotes = notes;
    }

    if (deliveryPhoto) {
      order.deliveryTracking.deliveryPhoto = deliveryPhoto;
    }

    if (status === 'delivered') {
      order.deliveryTracking.actualDeliveryTime = new Date();
      order.actualDeliveryTime = new Date();
    }

    order.timeline.push({
      status,
      message: `Delivery status: ${status}`,
      timestamp: new Date(),
      updatedBy: req.user._id
    });

    await order.save();

    // Emit socket event to customer
    if (req.io) {
      req.io.to(`user_${order.customer}`).emit('delivery_status_updated', {
        orderId: order._id,
        status,
        location: order.deliveryTracking.currentLocation,
        timestamp: new Date()
      });

      // Notify restaurant of delivery completion
      if (status === 'delivered') {
        req.io.to(`restaurant_${order.restaurant}`).emit('order_delivered', {
          orderId: order._id,
          orderNumber: order.orderNumber
        });
      }
    }

    res.json({
      success: true,
      message: 'Delivery status updated successfully'
    });
  } catch (error) {
    console.error('Update delivery status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update delivery status'
    });
  }
});

// @desc    Cancel order
// @route   PUT /api/orders/:id/cancel
// @access  Private
router.put('/:id/cancel', protect, [
  body('reason').notEmpty().withMessage('Cancellation reason is required')
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

    const { reason } = req.body;
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check if user can cancel this order
    const canCancel = order.customer.toString() === req.user._id.toString() ||
                     req.user.role === 'admin' ||
                     (req.user.role === 'restaurant' && order.restaurant.toString() === req.user.restaurantId);

    if (!canCancel) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Check if order can be cancelled
    if (!order.canBeCancelled()) {
      return res.status(400).json({
        success: false,
        message: 'Order cannot be cancelled at this stage'
      });
    }

    // Cancel order
    order.status = 'cancelled';
    order.cancellationReason = reason;
    order.cancelledBy = req.user._id;
    order.cancelledAt = new Date();

    order.timeline.push({
      status: 'cancelled',
      message: `Order cancelled: ${reason}`,
      timestamp: new Date(),
      updatedBy: req.user._id
    });

    await order.save();

    // Emit socket events
    if (req.io) {
      req.io.to(`user_${order.customer}`).emit('order_cancelled', {
        orderId: order._id,
        reason,
        cancelledBy: req.user.role
      });

      req.io.to(`restaurant_${order.restaurant}`).emit('order_cancelled', {
        orderId: order._id,
        orderNumber: order.orderNumber,
        reason
      });
    }

    res.json({
      success: true,
      message: 'Order cancelled successfully'
    });
  } catch (error) {
    console.error('Cancel order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel order'
    });
  }
});

// @desc    Rate order
// @route   PUT /api/orders/:id/rate
// @access  Private (Customer)
router.put('/:id/rate', protect, [
  body('food').isInt({ min: 1, max: 5 }).withMessage('Food rating must be between 1 and 5'),
  body('delivery').optional().isInt({ min: 1, max: 5 }).withMessage('Delivery rating must be between 1 and 5'),
  body('overall').isInt({ min: 1, max: 5 }).withMessage('Overall rating must be between 1 and 5'),
  body('comment').optional().isLength({ max: 500 }).withMessage('Comment cannot exceed 500 characters')
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

    const { food, delivery, overall, comment } = req.body;
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check if user is the customer
    if (order.customer.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only the customer can rate the order'
      });
    }

    // Check if order is completed
    if (order.status !== 'delivered') {
      return res.status(400).json({
        success: false,
        message: 'Can only rate completed orders'
      });
    }

    // Check if already rated
    if (order.rating.ratedAt) {
      return res.status(400).json({
        success: false,
        message: 'Order has already been rated'
      });
    }

    // Add rating
    order.rating = {
      food,
      delivery: order.orderType === 'delivery' ? delivery : undefined,
      overall,
      comment,
      ratedAt: new Date()
    };

    await order.save();

    // Update restaurant rating (simplified - in production, you'd have more complex logic)
    const restaurant = await Restaurant.findById(order.restaurant);
    if (restaurant) {
      const totalOrders = await Order.countDocuments({
        restaurant: restaurant._id,
        'rating.ratedAt': { $exists: true }
      });

      const avgRating = await Order.aggregate([
        { $match: { restaurant: restaurant._id, 'rating.ratedAt': { $exists: true } } },
        { $group: { _id: null, avgRating: { $avg: '$rating.overall' } } }
      ]);

      restaurant.rating.average = avgRating[0]?.avgRating || 0;
      restaurant.rating.count = totalOrders;
      await restaurant.save();
    }

    res.json({
      success: true,
      message: 'Order rated successfully'
    });
  } catch (error) {
    console.error('Rate order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to rate order'
    });
  }
});

// @desc    Get restaurant orders
// @route   GET /api/orders/restaurant/:restaurantId
// @access  Private (Restaurant/Admin)
router.get('/restaurant/:restaurantId', protect, authorize('restaurant', 'admin'), async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const { status, page = 1, limit = 20 } = req.query;

    // Check if restaurant owner is accessing their own orders
    if (req.user.role === 'restaurant') {
      const restaurant = await Restaurant.findOne({ owner: req.user._id });
      if (!restaurant || restaurant._id.toString() !== restaurantId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }
    }

    const query = { restaurant: restaurantId };
    if (status) {
      query.status = status;
    }

    const orders = await Order.find(query)
      .populate('customer', 'firstName lastName phone')
      .populate('items.menuItem', 'name')
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
    console.error('Get restaurant orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get restaurant orders'
    });
  }
});

module.exports = router;