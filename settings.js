document.addEventListener('DOMContentLoaded', () => {
  const settingsForm = document.getElementById('settingsForm');
  const apiKeyInput = document.getElementById('apiKey');

  // Fetch current API key
  const fetchApiKey = async () => {
    try {
      const response = await fetch('/api/settings/apikey');
      const data = await response.json();
      if (data.success) {
        apiKeyInput.value = data.key;
      }
    } catch (error) {
      console.error('Error fetching API key:', error);
    }
  };

  // Save API key
  settingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    try {
      const response = await fetch('/api/settings/apikey', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          key: apiKeyInput.value
        })
      });

      const data = await response.json();
      if (data.success) {
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.textContent = 'API key saved successfully!';
        document.body.appendChild(notification);
        setTimeout(() => {
          notification.remove();
        }, 3000);
      } else {
        throw new Error(data.message);
      }
    } catch (error) {
      const notification = document.createElement('div');
      notification.className = 'notification error';
      notification.textContent = error.message || 'Failed to save API key';
      document.body.appendChild(notification);
      setTimeout(() => {
        notification.remove();
      }, 3000);
    }
  });

  // Load current API key when page loads
  fetchApiKey();
});
