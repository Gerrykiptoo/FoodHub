const express = require('express');
const OpenAI = require('openai');
const { body, validationResult } = require('express-validator');
const { protect, optionalAuth } = require('../middleware/auth');
const Restaurant = require('../models/Restaurant');
const MenuItem = require('../models/MenuItem');
const Order = require('../models/Order');

const router = express.Router();

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// @desc    Chat with AI assistant
// @route   POST /api/ai/chat
// @access  Public (with optional auth for personalization)
router.post('/chat', optionalAuth, [
  body('message').notEmpty().withMessage('Message is required'),
  body('context').optional().isObject().withMessage('Context must be an object')
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

    const { message, context = {} } = req.body;
    const user = req.user;

    // Build system prompt based on context
    let systemPrompt = `You are FoodBot, a helpful AI assistant for Foodhub, a food delivery platform. You help users with:

1. Finding restaurants and food recommendations
2. Explaining menu items and ingredients
3. Helping with dietary restrictions and allergies
4. Order assistance and tracking
5. General food and nutrition questions
6. Platform features and how to use them

Guidelines:
- Be friendly, helpful, and concise
- Focus on food and restaurant-related topics
- If asked about non-food topics, politely redirect to food-related assistance
- Provide specific recommendations when possible
- Always prioritize user safety regarding allergies and dietary restrictions
- If you don't have specific information, suggest contacting customer support

Current context: You are helping a user on the Foodhub platform.`;

    // Add user context if authenticated
    if (user) {
      systemPrompt += `\n\nUser information:
- Name: ${user.firstName} ${user.lastName}
- Role: ${user.role}
- Preferences: ${user.preferences?.cuisine?.join(', ') || 'None specified'}
- Dietary restrictions: ${user.preferences?.dietaryRestrictions?.join(', ') || 'None specified'}`;
    }

    // Add location context if provided
    if (context.location) {
      systemPrompt += `\n\nUser location: ${context.location.city || 'Unknown city'}`;
    }

    // Add restaurant context if browsing a specific restaurant
    if (context.restaurantId) {
      try {
        const restaurant = await Restaurant.findById(context.restaurantId)
          .select('name description cuisine priceRange rating');
        if (restaurant) {
          systemPrompt += `\n\nCurrently viewing restaurant: ${restaurant.name}
- Cuisine: ${restaurant.cuisine.join(', ')}
- Price range: ${restaurant.priceRange}
- Rating: ${restaurant.rating.average}/5 (${restaurant.rating.count} reviews)
- Description: ${restaurant.description}`;
        }
      } catch (error) {
        console.error('Error fetching restaurant context:', error);
      }
    }

    // Prepare conversation history
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message }
    ];

    // Add conversation history if provided
    if (context.conversationHistory && Array.isArray(context.conversationHistory)) {
      const history = context.conversationHistory.slice(-10); // Keep last 10 messages
      messages.splice(1, 0, ...history);
    }

    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages,
      max_tokens: 500,
      temperature: 0.7,
      presence_penalty: 0.1,
      frequency_penalty: 0.1
    });

    const aiResponse = completion.choices[0].message.content;

    // Check if the response needs additional data
    const needsRestaurantData = aiResponse.toLowerCase().includes('restaurant') && 
                               aiResponse.toLowerCase().includes('recommend');
    
    let additionalData = {};

    if (needsRestaurantData && context.location) {
      try {
        // Get nearby restaurants
        const restaurants = await Restaurant.find({
          isActive: true,
          isVerified: true,
          'address.coordinates': {
            $near: {
              $geometry: {
                type: 'Point',
                coordinates: [context.location.lng, context.location.lat]
              },
              $maxDistance: 10000 // 10km
            }
          }
        })
        .select('name cuisine rating priceRange deliveryTime')
        .limit(5);

        additionalData.nearbyRestaurants = restaurants;
      } catch (error) {
        console.error('Error fetching nearby restaurants:', error);
      }
    }

    res.json({
      success: true,
      data: {
        response: aiResponse,
        additionalData,
        timestamp: new Date()
      }
    });

  } catch (error) {
    console.error('AI chat error:', error);
    
    // Fallback response if OpenAI fails
    const fallbackResponse = "I'm sorry, I'm having trouble processing your request right now. Please try again in a moment, or contact our customer support for immediate assistance.";
    
    res.json({
      success: true,
      data: {
        response: fallbackResponse,
        isFallback: true,
        timestamp: new Date()
      }
    });
  }
});

// @desc    Get food recommendations
// @route   POST /api/ai/recommendations
// @access  Public (with optional auth)
router.post('/recommendations', optionalAuth, [
  body('preferences').optional().isObject().withMessage('Preferences must be an object'),
  body('location').optional().isObject().withMessage('Location must be an object')
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

    const { preferences = {}, location } = req.body;
    const user = req.user;

    // Combine user preferences with request preferences
    const combinedPreferences = {
      cuisine: [...(user?.preferences?.cuisine || []), ...(preferences.cuisine || [])],
      dietaryRestrictions: [...(user?.preferences?.dietaryRestrictions || []), ...(preferences.dietaryRestrictions || [])],
      priceRange: preferences.priceRange || user?.preferences?.priceRange,
      mood: preferences.mood, // e.g., 'comfort', 'healthy', 'adventurous'
      mealType: preferences.mealType // e.g., 'breakfast', 'lunch', 'dinner', 'snack'
    };

    // Build query for restaurants
    let restaurantQuery = {
      isActive: true,
      isVerified: true
    };

    // Add location filter if provided
    if (location && location.lat && location.lng) {
      restaurantQuery['address.coordinates'] = {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [location.lng, location.lat]
          },
          $maxDistance: 15000 // 15km
        }
      };
    }

    // Add cuisine filter
    if (combinedPreferences.cuisine.length > 0) {
      restaurantQuery.cuisine = { $in: combinedPreferences.cuisine };
    }

    // Add price range filter
    if (combinedPreferences.priceRange) {
      restaurantQuery.priceRange = combinedPreferences.priceRange;
    }

    // Get restaurants
    const restaurants = await Restaurant.find(restaurantQuery)
      .select('name description cuisine rating priceRange deliveryTime images logo')
      .sort({ 'rating.average': -1 })
      .limit(10);

    // Get menu items based on preferences
    let menuItemQuery = {
      isAvailable: true,
      restaurant: { $in: restaurants.map(r => r._id) }
    };

    // Add dietary restrictions filter
    if (combinedPreferences.dietaryRestrictions.length > 0) {
      menuItemQuery.dietaryInfo = { $in: combinedPreferences.dietaryRestrictions };
    }

    // Add meal type filter
    if (combinedPreferences.mealType) {
      const mealTypeCategories = {
        breakfast: ['breakfast'],
        lunch: ['main-course', 'salads', 'sandwiches', 'burgers'],
        dinner: ['main-course', 'pasta', 'pizza', 'seafood'],
        snack: ['appetizers', 'sides', 'desserts']
      };
      
      if (mealTypeCategories[combinedPreferences.mealType]) {
        menuItemQuery.category = { $in: mealTypeCategories[combinedPreferences.mealType] };
      }
    }

    const menuItems = await MenuItem.find(menuItemQuery)
      .populate('restaurant', 'name logo')
      .select('name description price images rating category dietaryInfo')
      .sort({ orderCount: -1, 'rating.average': -1 })
      .limit(15);

    // Use AI to generate personalized recommendations
    const aiPrompt = `Based on the following user preferences, generate 3-5 personalized food recommendations:

User Preferences:
- Cuisine: ${combinedPreferences.cuisine.join(', ') || 'Any'}
- Dietary Restrictions: ${combinedPreferences.dietaryRestrictions.join(', ') || 'None'}
- Price Range: ${combinedPreferences.priceRange || 'Any'}
- Mood: ${combinedPreferences.mood || 'Not specified'}
- Meal Type: ${combinedPreferences.mealType || 'Any'}

Available Restaurants: ${restaurants.map(r => `${r.name} (${r.cuisine.join(', ')})`).join(', ')}

Available Menu Items: ${menuItems.slice(0, 10).map(m => `${m.name} from ${m.restaurant.name}`).join(', ')}

Provide recommendations in this format:
1. [Restaurant Name] - [Dish Name]: Brief reason why it matches their preferences
2. [Restaurant Name] - [Dish Name]: Brief reason why it matches their preferences
etc.

Keep each recommendation to one line and focus on why it matches their specific preferences.`;

    let aiRecommendations = '';
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'You are a food recommendation expert. Provide concise, personalized recommendations.' },
          { role: 'user', content: aiPrompt }
        ],
        max_tokens: 300,
        temperature: 0.8
      });

      aiRecommendations = completion.choices[0].message.content;
    } catch (error) {
      console.error('AI recommendation error:', error);
      aiRecommendations = 'Here are some popular options based on your preferences.';
    }

    res.json({
      success: true,
      data: {
        aiRecommendations,
        restaurants: restaurants.slice(0, 5),
        menuItems: menuItems.slice(0, 8),
        preferences: combinedPreferences
      }
    });

  } catch (error) {
    console.error('Get recommendations error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get recommendations'
    });
  }
});

// @desc    Analyze menu item for dietary info
// @route   POST /api/ai/analyze-menu-item
// @access  Public
router.post('/analyze-menu-item', [
  body('menuItemId').notEmpty().withMessage('Menu item ID is required'),
  body('question').optional().isString().withMessage('Question must be a string')
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

    const { menuItemId, question } = req.body;

    // Get menu item details
    const menuItem = await MenuItem.findById(menuItemId)
      .populate('restaurant', 'name')
      .select('name description ingredients allergens dietaryInfo nutrition spiceLevel');

    if (!menuItem) {
      return res.status(404).json({
        success: false,
        message: 'Menu item not found'
      });
    }

    // Build AI prompt
    const aiPrompt = `Analyze this menu item and ${question ? `answer the specific question: "${question}"` : 'provide helpful information about ingredients, allergens, and dietary suitability'}

Menu Item: ${menuItem.name}
Restaurant: ${menuItem.restaurant.name}
Description: ${menuItem.description}
Ingredients: ${menuItem.ingredients?.join(', ') || 'Not specified'}
Allergens: ${menuItem.allergens?.join(', ') || 'None listed'}
Dietary Info: ${menuItem.dietaryInfo?.join(', ') || 'None specified'}
Spice Level: ${menuItem.spiceLevel || 'Not specified'}
Nutrition: ${menuItem.nutrition ? JSON.stringify(menuItem.nutrition) : 'Not available'}

${question ? 'Answer the question directly and provide any relevant additional information.' : 'Provide information about what this dish contains, who might want to avoid it, and any dietary considerations.'}

Be specific about allergens and dietary restrictions. If information is not available, clearly state that.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { 
          role: 'system', 
          content: 'You are a knowledgeable food analyst. Provide accurate, helpful information about food items, focusing on safety and dietary considerations. Always err on the side of caution with allergen information.' 
        },
        { role: 'user', content: aiPrompt }
      ],
      max_tokens: 400,
      temperature: 0.3 // Lower temperature for more factual responses
    });

    const analysis = completion.choices[0].message.content;

    res.json({
      success: true,
      data: {
        menuItem: {
          id: menuItem._id,
          name: menuItem.name,
          restaurant: menuItem.restaurant.name,
          description: menuItem.description
        },
        analysis,
        question: question || null
      }
    });

  } catch (error) {
    console.error('Analyze menu item error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to analyze menu item'
    });
  }
});

// @desc    Get order assistance
// @route   POST /api/ai/order-help
// @access  Private
router.post('/order-help', protect, [
  body('orderId').notEmpty().withMessage('Order ID is required'),
  body('issue').notEmpty().withMessage('Issue description is required')
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

    const { orderId, issue } = req.body;

    // Get order details
    const order = await Order.findById(orderId)
      .populate('restaurant', 'name phone')
      .populate('customer', 'firstName lastName')
      .select('orderNumber status timeline payment deliveryTracking createdAt');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check if user can access this order
    const canAccess = order.customer._id.toString() === req.user._id.toString() ||
                     req.user.role === 'admin';

    if (!canAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Build AI prompt for order assistance
    const aiPrompt = `Help resolve this customer's order issue:

Order Details:
- Order Number: ${order.orderNumber}
- Status: ${order.status}
- Restaurant: ${order.restaurant.name}
- Order Date: ${order.createdAt.toLocaleDateString()}
- Payment Status: ${order.payment.status}
- Customer Issue: ${issue}

Recent Timeline:
${order.timeline.slice(-3).map(t => `- ${t.timestamp.toLocaleString()}: ${t.message}`).join('\n')}

Provide helpful guidance for resolving this issue. Include:
1. Immediate steps the customer can take
2. When to contact customer support
3. Expected resolution timeframes
4. Any relevant policies

Be empathetic and solution-focused.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { 
          role: 'system', 
          content: 'You are a customer service AI assistant for Foodhub. Help customers resolve order issues with empathy and practical solutions. Always prioritize customer satisfaction while following company policies.' 
        },
        { role: 'user', content: aiPrompt }
      ],
      max_tokens: 500,
      temperature: 0.5
    });

    const assistance = completion.choices[0].message.content;

    // Determine if this needs human intervention
    const needsHumanHelp = issue.toLowerCase().includes('refund') ||
                          issue.toLowerCase().includes('allerg') ||
                          issue.toLowerCase().includes('sick') ||
                          issue.toLowerCase().includes('wrong order') ||
                          order.status === 'cancelled';

    res.json({
      success: true,
      data: {
        assistance,
        needsHumanHelp,
        order: {
          orderNumber: order.orderNumber,
          status: order.status,
          restaurant: order.restaurant.name
        },
        supportContact: needsHumanHelp ? {
          phone: '+1-800-FOODHUB',
          email: 'support@foodhub.com',
          chat: true
        } : null
      }
    });

  } catch (error) {
    console.error('Order help error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get order assistance'
    });
  }
});

module.exports = router;