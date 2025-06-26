<template>
  <div class="home">
    <!-- Hero Section -->
    <section class="bg-gradient-to-r from-orange-500 to-red-600 text-white py-20">
      <div class="max-w-7xl mx-auto px-4 text-center">
        <h1 class="text-5xl font-bold mb-6">Welcome to Foodhub</h1>
        <p class="text-xl mb-8">Delicious food delivered to your doorstep</p>
        <button class="bg-white text-orange-600 px-8 py-3 rounded-lg font-semibold hover:bg-gray-100 transition duration-300">
          Order Now
        </button>
      </div>
    </section>

    <!-- Features Section -->
    <section class="py-16">
      <div class="max-w-7xl mx-auto px-4">
        <h2 class="text-3xl font-bold text-center mb-12">Why Choose Foodhub?</h2>
        <div class="grid md:grid-cols-3 gap-8">
          <div class="text-center">
            <div class="bg-orange-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <span class="text-2xl">🚚</span>
            </div>
            <h3 class="text-xl font-semibold mb-2">Fast Delivery</h3>
            <p class="text-gray-600">Get your food delivered in 30 minutes or less</p>
          </div>
          <div class="text-center">
            <div class="bg-orange-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <span class="text-2xl">🍕</span>
            </div>
            <h3 class="text-xl font-semibold mb-2">Quality Food</h3>
            <p class="text-gray-600">Fresh ingredients from the best restaurants</p>
          </div>
          <div class="text-center">
            <div class="bg-orange-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <span class="text-2xl">📱</span>
            </div>
            <h3 class="text-xl font-semibold mb-2">Easy Ordering</h3>
            <p class="text-gray-600">Simple and intuitive ordering process</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Popular Restaurants -->
    <section class="py-16 bg-gray-100">
      <div class="max-w-7xl mx-auto px-4">
        <h2 class="text-3xl font-bold text-center mb-12">Popular Restaurants</h2>
        <div class="grid md:grid-cols-4 gap-6">
          <div v-for="restaurant in popularRestaurants" :key="restaurant.id" 
               class="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition duration-300">
            <img :src="restaurant.image" :alt="restaurant.name" class="w-full h-48 object-cover">
            <div class="p-4">
              <h3 class="font-semibold text-lg mb-2">{{ restaurant.name }}</h3>
              <p class="text-gray-600 text-sm mb-2">{{ restaurant.cuisine }}</p>
              <div class="flex items-center justify-between">
                <span class="text-yellow-500">⭐ {{ restaurant.rating }}</span>
                <span class="text-gray-500 text-sm">{{ restaurant.deliveryTime }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script>
export default {
  name: 'Home',
  data() {
    return {
      popularRestaurants: [
        {
          id: 1,
          name: 'Pizza Palace',
          cuisine: 'Italian',
          rating: 4.5,
          deliveryTime: '25-30 min',
          image: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=400&h=300&fit=crop'
        },
        {
          id: 2,
          name: 'Burger Barn',
          cuisine: 'American',
          rating: 4.3,
          deliveryTime: '20-25 min',
          image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&h=300&fit=crop'
        },
        {
          id: 3,
          name: 'Sushi Spot',
          cuisine: 'Japanese',
          rating: 4.7,
          deliveryTime: '30-35 min',
          image: 'https://images.unsplash.com/photo-1579584425555-c3ce17fd4351?w=400&h=300&fit=crop'
        },
        {
          id: 4,
          name: 'Taco Town',
          cuisine: 'Mexican',
          rating: 4.4,
          deliveryTime: '15-20 min',
          image: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ca4b?w=400&h=300&fit=crop'
        }
      ]
    }
  }
}
</script>