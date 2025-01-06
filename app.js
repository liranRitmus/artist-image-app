const accessToken = 'rCrDd2QB2rhBCU1HKI7AYhQsGzCpMt';

document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('searchInput');
  const searchButton = document.getElementById('searchButton');
  const exportButton = document.getElementById('exportButton');
  const imageContainer = document.getElementById('imageContainer');
  
  let currentResults = [];

  // Function to generate and download CSV
  const exportToCSV = () => {
    if (currentResults.length === 0) {
      alert('No results to export');
      return;
    }

    const csvContent = [
      ['Name', 'Image URL', 'Attribution'],
      ...currentResults.map(result => [
        result.artist,
        result.image.url,
        result.attribution
      ])
    ]
    .map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
    .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'artist_images.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  exportButton.addEventListener('click', exportToCSV);

  // Function to fetch and display image for a single artist
  const fetchArtistImage = async (artist, index) => {
    try {
      const response = await fetch(
        `https://api.openverse.org/v1/images/?q=${encodeURIComponent(artist)}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch images');
      }

      const data = await response.json();
      
      // Filter images to only include exact "by" licenses
      const filteredResults = data.results.filter(result => 
        result.license.toLowerCase() === 'by'
      );
      
      if (filteredResults.length === 0) {
        throw new Error('No images found with BY license');
      }

      // Get a random image from the filtered results
      const randomIndex = Math.floor(Math.random() * filteredResults.length);
      const image = filteredResults[randomIndex];
      
      // Fetch detailed image information
      const detailResponse = await fetch(
        `https://api.openverse.org/v1/images/${image.id}/`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );
      
      if (!detailResponse.ok) {
        throw new Error('Failed to fetch image details');
      }
      
      const imageDetails = await detailResponse.json();
      
      const result = {
        artist,
        image,
        attribution: imageDetails.attribution || 'Unknown',
        license_url: imageDetails.license_url
      };
      currentResults[index] = result;

      const imageItem = document.createElement('div');
      imageItem.className = 'image-item';
      imageItem.innerHTML = `
        <div class="artist-name">${artist}</div>
        <img src="${image.url}" alt="${artist}">
        <div class="attribution">
          <p>${result.attribution}</p>
          <p>License: <a href="${imageDetails.license_url}" target="_blank">${image.license}</a></p>
          <a href="${image.url}" target="_blank" class="source-link">View Source</a>
        </div>
        <button class="change-button" data-artist="${artist}" data-index="${index}">Change</button>
        <button class="add-credit-button" 
                data-artist="${artist}" 
                data-attribution="${result.attribution}" 
                data-url="${image.url}"
                data-license-url="${imageDetails.license_url}">Add</button>
      `;
      
      // Store the shown image index to avoid duplicates
      imageItem.dataset.shownIndex = randomIndex;
      return imageItem;
    } catch (error) {
      const errorItem = document.createElement('div');
      errorItem.className = 'image-item error';
      errorItem.textContent = `Error for ${artist}: ${error.message}`;
      return errorItem;
    }
  };

  // Handle search button click
  searchButton.addEventListener('click', async () => {
    const artists = searchInput.value
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    if (artists.length === 0) {
      alert('Please enter artist names (one per line)');
      return;
    }

    imageContainer.innerHTML = '<div class="loading">Loading images...</div>';
    
    // Fetch images for all artists
    const imageItems = await Promise.all(artists.map((artist, index) => fetchArtistImage(artist, index)));
    imageContainer.innerHTML = '';
    imageItems.forEach(item => imageContainer.appendChild(item));
  });

  // Handle button clicks using event delegation
  imageContainer.addEventListener('click', async (e) => {
    if (e.target.classList.contains('change-button')) {
      const button = e.target;
      button.disabled = true;
      button.textContent = 'Loading...';
      
      const artist = button.dataset.artist;
      const index = button.dataset.index;
      
      try {
        const imageItem = await fetchArtistImage(artist, index);
        const oldItem = button.closest('.image-item');
        oldItem.replaceWith(imageItem);
      } catch (error) {
        console.error('Error changing image:', error);
        button.disabled = false;
        button.textContent = 'Change';
      }
    } else if (e.target.classList.contains('add-credit-button')) {
      const button = e.target;
      const attribution = button.closest('.image-item').querySelector('.attribution p').textContent;
      const url = button.dataset.url;
      
      // Save to credits via API
      try {
        const response = await fetch('/api/credits', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            artist: button.dataset.artist,
            attribution: attribution,
            url: url,
            thumbnail: button.closest('.image-item').querySelector('img').src,
            query: button.dataset.artist,
            license_url: button.dataset.licenseUrl
          })
        });

        const data = await response.json();
        
        if (data.existing) {
          // Ask user if they want to replace existing image
          const shouldReplace = confirm('This artist already exists. Do you want to replace the image?');
          if (shouldReplace) {
            // Delete existing credit
            const deleteResponse = await fetch(`/api/credits/${data.existingId}`, {
              method: 'DELETE'
            });
            
            if (deleteResponse.ok) {
              // Add new credit
              const addResponse = await fetch('/api/credits', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  artist: button.dataset.artist,
                  attribution: attribution,
                  url: url,
                  thumbnail: button.closest('.image-item').querySelector('img').src,
                  query: button.dataset.artist,
                  license_url: button.dataset.licenseUrl
                })
              });
              
              const addData = await addResponse.json();
              if (addResponse.ok) {
                const notification = document.createElement('div');
                notification.className = 'notification';
                notification.textContent = 'Image replaced successfully!';
                document.body.appendChild(notification);
                setTimeout(() => {
                  notification.remove();
                }, 3000);
              } else {
                throw new Error(addData.message || 'Error replacing image');
              }
            } else {
              throw new Error('Error deleting existing image');
            }
          }
        } else if (response.ok) {
          // Show success notification
          const notification = document.createElement('div');
          notification.className = 'notification';
          notification.textContent = 'Added to credits!';
          document.body.appendChild(notification);
          setTimeout(() => {
            notification.remove();
          }, 3000);
        } else {
          // Show error notification
          const notification = document.createElement('div');
          notification.className = 'notification';
          notification.textContent = data.message || 'Error adding to credits';
          document.body.appendChild(notification);
          setTimeout(() => {
            notification.remove();
          }, 3000);
        }
      } catch (error) {
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.textContent = 'Failed to connect to server';
        document.body.appendChild(notification);
        setTimeout(() => {
          notification.remove();
        }, 3000);
      }
    }
  });
});
