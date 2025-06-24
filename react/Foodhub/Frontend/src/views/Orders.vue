<template>
  <div class="orders">
    <div class="max-w-7xl mx-auto px-4 py-8">
      <h1 class="text-3xl font-bold mb-8">Your Orders</h1>
      
      <!-- Order Tabs -->
      <div class="mb-8">
        <div class="border-b border-gray-200">
          <nav class="-mb-px flex space-x-8">
            <button 
              v-for="tab in tabs" 
              :key="tab.key"
              @click="activeTab = tab.key"
              :class="[
                'py-2 px-1 border-b-2 font-medium text-sm',
                activeTab === tab.key 
                  ? 'border-orange-500 text-orange-600' 
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              ]"
            >
              {{ tab.label }}
            </button>
          </nav>
        </div>
      </div>

      <!-- Orders List -->
      <div class="space-y-6">
        <div v-for="order in filteredOrders" :key="order.id" 
             class="bg-white rounded-lg shadow-md p-6">
          <div class="flex items-center justify-between mb-4">
            <div>
              <h3 class="text-lg font-semibold">Order #{{ order.id }}</h3>
              <p class="text-gray-600">{{ order.restaurant }}</p>
            </div>
            <div class="text-right">
              <span :class="[
                'px-3 py-1 rounded-full text-sm font-medium',
                getStatusColor(order.status)
              ]">
                {{ order.status }}
              </span>
              <p class="text-gray-500 text-sm mt-1">{{ formatDate(order.date) }}</p>
            </div>
          </div>

          <div class="border-t border-gray-200 pt-4">
            <div class="space-y-2">
              <div v-for="item in order.items" :key="item.id" 
                   class="flex justify-between items-center">
                <span class="text-gray-700">{{ item.quantity }}x {{ item.name }}</span>
                <span class="text-gray-900">${{ item.price.toFixed(2) }}</span>
              </div>
            </div>
            
            <div class="border-t border-gray-200 mt-4 pt-4">
              <div class="flex justify-between items-center font-semibold">
                <span>Total</span>
                <span>${{ order.total.toFixed(2) }}</span>
              </div>
            </div>
          </div>

          <!-- Order Actions -->
          <div class="mt-4 flex space-x-3">
            <button v-if="order.status === 'Delivered'" 
                    class="bg-orange-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-orange-600 transition duration-300">
              Reorder
            </button>
            <button v-if="order.status === 'Preparing' || order.status === 'On the way'" 
                    class="bg-blue-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-600 transition duration-300">
              Track Order
            </button>
            <button class="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 transition duration-300">
              View Details
            </button>
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div v-if="filteredOrders.length === 0" class="text-center py-12">
        <div class="text-6xl mb-4">🍽️</div>
        <h3 class="text-xl font-semibold text-gray-700 mb-2">No orders found</h3>
        <p class="text-gray-500 mb-6">You haven't placed any orders yet.</p>
        <router-link to="/restaurants" 
                     class="bg-orange-500 text-white px-6 py-3 rounded-lg hover:bg-orange-600 transition duration-300">
          Browse Restaurants
        </router-link>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'Orders',
  data() {
    return {
      activeTab: 'all',
      tabs: [
        { key: 'all', label: 'All Orders' },
        { key: 'active', label: 'Active' },
        { key: 'delivered', label: 'Delivered' },
        { key: 'cancelled', label: 'Cancelled' }
      ],
      orders: [
        {
          id: '12345',
          restaurant: 'Pizza Palace',
          status: 'Delivered',
          date: new Date('2024-01-15T18:30:00'),
          total: 24.99,
          items: [
            { id: 1, name: 'Margherita Pizza', quantity: 1, price: 18.99 },
            { id: 2, name: 'Garlic Bread', quantity: 1, price: 6.00 }
          ]
        },
        {
          id: '12346',
          restaurant: 'Burger Barn',
          status: 'On the way',
          date: new Date('2024-01-16T12:15:00'),
          total: 19.47,
          items: [
            { id: 3, name: 'Classic Burger', quantity: 2, price: 12.99 },
            { id: 4, name: 'French Fries', quantity: 1, price: 4.99 }
          ]
        },
        {
          id: '12347',
          restaurant: 'Sushi Spot',
          status: 'Preparing',
          date: new Date('2024-01-16T19:45:00'),
          total: 32.50,
          items: [
            { id: 5, name: 'California Roll', quantity: 2, price: 8.99 },
            { id: 6, name: 'Salmon Sashimi', quantity: 1, price: 14.99 }
          ]
        }
      ]
    }
  },
  computed: {
    filteredOrders() {
      if (this.activeTab === 'all') {
        return this.orders;
      } else if (this.activeTab === 'active') {
        return this.orders.filter(order => 
          ['Preparing', 'On the way', 'Confirmed'].includes(order.status)
        );
      } else if (this.activeTab === 'delivered') {
        return this.orders.filter(order => order.status === 'Delivered');
      } else if (this.activeTab === 'cancelled') {
        return this.orders.filter(order => order.status === 'Cancelled');
      }
      return this.orders;
    }
  },
  methods: {
    getStatusColor(status) {
      const colors = {
        'Preparing': 'bg-yellow-100 text-yellow-800',
        'On the way': 'bg-blue-100 text-blue-800',
        'Delivered': 'bg-green-100 text-green-800',
        'Cancelled': 'bg-red-100 text-red-800',
        'Confirmed': 'bg-purple-100 text-purple-800'
      };
      return colors[status] || 'bg-gray-100 text-gray-800';
    },
    formatDate(date) {
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
  }
}
</script>