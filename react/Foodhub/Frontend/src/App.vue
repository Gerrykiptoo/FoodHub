<template>
  <div id="app" class="min-h-screen bg-gray-50">
    <nav class="bg-white shadow-lg">
      <div class="max-w-7xl mx-auto px-4">
        <div class="flex justify-between h-16">
          <div class="flex items-center">
            <router-link to="/" class="flex-shrink-0 flex items-center">
              <h1 class="text-2xl font-bold text-orange-600">🍔 Foodhub</h1>
            </router-link>
          </div>
          <div class="flex items-center space-x-4">
            <router-link to="/" class="text-gray-700 hover:text-orange-600 px-3 py-2 rounded-md text-sm font-medium">
              Home
            </router-link>
            <router-link to="/restaurants" class="text-gray-700 hover:text-orange-600 px-3 py-2 rounded-md text-sm font-medium">
              Restaurants
            </router-link>
            <router-link to="/orders" class="text-gray-700 hover:text-orange-600 px-3 py-2 rounded-md text-sm font-medium">
              Orders
            </router-link>
          </div>
        </div>
      </div>
    </nav>

    <main>
      <router-view />
    </main>

    <footer class="bg-gray-800 text-white py-8 mt-12">
      <div class="max-w-7xl mx-auto px-4 text-center">
        <p>&copy; 2024 Foodhub. All rights reserved.</p>
      </div>
    </footer>
  </div>
</template>

<script>
export default {
  name: 'App'
}
</script>

<style>
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
</style>