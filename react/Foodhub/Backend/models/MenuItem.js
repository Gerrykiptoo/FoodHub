const mongoose = require('mongoose');

const optionSchema = new mongoose.Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true, min: 0 }
});

const customizationSchema = new mongoose.Schema({
  name: { type: String, required: true }, // e.g., "Size", "Toppings"
  type: {
    type: String,
    enum: ['single', 'multiple'],
    required: true
  },
  required: { type: Boolean, default: false },
  options: [optionSchema]
});

const nutritionSchema = new mongoose.Schema({
  calories: Number,
  protein: Number, // in grams
  carbs: Number,
  fat: Number,
  fiber: Number,
  sugar: Number,
  sodium: Number // in mg
});

const menuItemSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Menu item name is required'],
    trim: true,
    maxlength: [100, 'Menu item name cannot exceed 100 characters']
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  restaurant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: true
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    enum: [
      'appetizers', 'salads', 'soups', 'main-course', 'pasta', 'pizza', 
      'burgers', 'sandwiches', 'seafood', 'vegetarian', 'vegan', 
      'desserts', 'beverages', 'alcohol', 'sides', 'breakfast', 'specials'
    ]
  },
  price: {
    type: Number,
    required: [true, 'Price is required'],
    min: [0, 'Price cannot be negative']
  },
  originalPrice: {
    type: Number,
    min: [0, 'Original price cannot be negative']
  },
  images: [{
    url: String,
    alt: String,
    isPrimary: { type: Boolean, default: false }
  }],
  ingredients: [String],
  allergens: [{
    type: String,
    enum: [
      'gluten', 'dairy', 'eggs', 'fish', 'shellfish', 'tree-nuts', 
      'peanuts', 'soy', 'sesame', 'sulfites'
    ]
  }],
  dietaryInfo: [{
    type: String,
    enum: ['vegetarian', 'vegan', 'gluten-free', 'dairy-free', 'keto', 'low-carb', 'halal', 'kosher']
  }],
  spiceLevel: {
    type: String,
    enum: ['none', 'mild', 'medium', 'hot', 'very-hot'],
    default: 'none'
  },
  customizations: [customizationSchema],
  nutrition: nutritionSchema,
  preparationTime: {
    type: Number,
    required: true,
    min: 1 // in minutes
  },
  isAvailable: {
    type: Boolean,
    default: true
  },
  isPopular: {
    type: Boolean,
    default: false
  },
  isFeatured: {
    type: Boolean,
    default: false
  },
  rating: {
    average: { type: Number, default: 0, min: 0, max: 5 },
    count: { type: Number, default: 0 }
  },
  orderCount: {
    type: Number,
    default: 0
  },
  tags: [String],
  availableHours: {
    start: String, // "09:00"
    end: String    // "22:00"
  },
  maxQuantityPerOrder: {
    type: Number,
    default: 10
  },
  discountPercentage: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  }
}, {
  timestamps: true
});

// Indexes
menuItemSchema.index({ restaurant: 1, category: 1 });
menuItemSchema.index({ restaurant: 1, isAvailable: 1 });
menuItemSchema.index({ price: 1 });
menuItemSchema.index({ rating: -1 });
menuItemSchema.index({ orderCount: -1 });

// Virtual for discounted price
menuItemSchema.virtual('discountedPrice').get(function() {
  if (this.discountPercentage > 0) {
    return this.price * (1 - this.discountPercentage / 100);
  }
  return this.price;
});

// Virtual for final price (considering customizations)
menuItemSchema.methods.calculatePrice = function(customizations = []) {
  let totalPrice = this.discountedPrice;
  
  customizations.forEach(customization => {
    const customizationConfig = this.customizations.find(c => c.name === customization.name);
    if (customizationConfig) {
      customization.selectedOptions.forEach(optionName => {
        const option = customizationConfig.options.find(o => o.name === optionName);
        if (option) {
          totalPrice += option.price;
        }
      });
    }
  });
  
  return Math.round(totalPrice * 100) / 100; // Round to 2 decimal places
};

// Check if item is available at current time
menuItemSchema.methods.isAvailableNow = function() {
  if (!this.isAvailable) return false;
  
  if (!this.availableHours.start || !this.availableHours.end) return true;
  
  const now = new Date();
  const currentTime = now.toTimeString().substring(0, 5);
  
  return currentTime >= this.availableHours.start && currentTime <= this.availableHours.end;
};

// Ensure JSON output includes virtuals
menuItemSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('MenuItem', menuItemSchema);