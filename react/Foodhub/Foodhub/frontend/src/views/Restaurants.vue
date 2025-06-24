<template>
  <div class="restaurants">
    <div class="max-w-7xl mx-auto px-4 py-8">
      <h1 class="text-3xl font-bold mb-8">All Restaurants</h1>
      
      <!-- Search and Filter -->
      <div class="mb-8">
        <div class="flex flex-col md:flex-row gap-4">
          <input 
            v-model="searchQuery"
            type="text" 
            placeholder="Search restaurants..." 
            class="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
          <select 
            v-model="selectedCuisine"
            class="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            <option value="">All Cuisines</option>
            <option value="Italian">Italian</option>
            <option value="American">American</option>
            <option value="Japanese">Japanese</option>
            <option value="Mexican">Mexican</option>
            <option value="Indian">Indian</option>
          </select>
        </div>
      </div>

      <!-- Restaurant Grid -->
      <div class="grid md:grid-cols-3 lg:grid-cols-4 gap-6">
        <div v-for="restaurant in filteredRestaurants" :key="restaurant.id" 
             class="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition duration-300 cursor-pointer">
          <img :src="restaurant.image" :alt="restaurant.name" class="w-full h-48 object-cover">
          <div class="p-4">
            <h3 class="font-semibold text-lg mb-2">{{ restaurant.name }}</h3>
            <p class="text-gray-600 text-sm mb-2">{{ restaurant.cuisine }}</p>
            <p class="text-gray-500 text-xs mb-3">{{ restaurant.description }}</p>
            <div class="flex items-center justify-between mb-3">
              <span class="text-yellow-500 flex items-center">
                ⭐ {{ restaurant.rating }}
                <span class="text-gray-500 text-xs ml-1">({{ restaurant.reviews }})</span>
              </span>
              <span class="text-gray-500 text-sm">{{ restaurant.deliveryTime }}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-sm text-gray-600">Delivery: ${{ restaurant.deliveryFee }}</span>
              <button class="bg-orange-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-orange-600 transition duration-300">
                View Menu
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Loading State -->
      <div v-if="filteredRestaurants.length === 0" class="text-center py-12">
        <p class="text-gray-500 text-lg">No restaurants found matching your criteria.</p>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'Restaurants',
  data() {
    return {
      searchQuery: '',
      selectedCuisine: '',
      restaurants: [
        {
          id: 1,
          name: 'Pizza Palace',
          cuisine: 'Italian',
          rating: 4.5,
          reviews: 234,
          deliveryTime: '25-30 min',
          deliveryFee: 2.99,
          description: 'Authentic Italian pizzas with fresh ingredients',
          image: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=400&h=300&fit=crop'
        },
        {
          id: 2,
          name: 'Burger Barn',
          cuisine: 'American',
          rating: 4.3,
          reviews: 189,
          deliveryTime: '20-25 min',
          deliveryFee: 1.99,
          description: 'Juicy burgers and crispy fries',
          image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&h=300&fit=crop'
        },
        {
          id: 3,
          name: 'Sushi Spot',
          cuisine: 'Japanese',
          rating: 4.7,
          reviews: 156,
          deliveryTime: '30-35 min',
          deliveryFee: 3.99,
          description: 'Fresh sushi and traditional Japanese dishes',
          image: 'https://images.unsplash.com/photo-1579584425555-c3ce17fd4351?w=400&h=300&fit=crop'
        },
        {
          id: 4,
          name: 'Taco Town',
          cuisine: 'Mexican',
          rating: 4.4,
          reviews: 298,
          deliveryTime: '15-20 min',
          deliveryFee: 1.49,
          description: 'Authentic Mexican tacos and burritos',
          image: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ca4b?w=400&h=300&fit=crop'
        },
        {
          id: 5,
          name: 'Spice Garden',
          cuisine: 'Indian',
          rating: 4.6,
          reviews: 167,
          deliveryTime: '35-40 min',
          deliveryFee: 2.49,
          description: 'Aromatic Indian curries and biryanis',
          image: 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=400&h=300&fit=crop'
        },
        {
          id: 6,
          name: 'Pasta Paradise',
          cuisine: 'Italian',
          rating: 4.2,
          reviews: 143,
          deliveryTime: '25-30 min',
          deliveryFee: 2.99,
          description: 'Homemade pasta with traditional sauces',
          image: 'https://images.unsplash.com/photo-1621996346565-e3dbc353d2e5?w=400&h=300&fit=crop'
        }
      ]
    }
  },
  computed: {
    filteredRestaurants() {
      return this.restaurants.filter(restaurant => {
        const matchesSearch = restaurant.name.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
                            restaurant.cuisine.toLowerCase().includes(this.searchQuery.toLowerCase());
        const matchesCuisine = !this.selectedCuisine || restaurant.cuisine === this.selectedCuisine;
        return matchesSearch && matchesCuisine;
      });
    }
  }
}
</script>