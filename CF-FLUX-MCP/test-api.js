// Simple API test script
console.log('Starting Flux API test...');

// API constants
const FLUX_TOKEN = 'Hsue8p20snchw734ambncMD';
const WORKER_URL = 'https://flux.aipeipei.net';

// Test cases covering both klein-4b (steps 1-8) and flux-2-dev (steps 1-50)
const TEST_CASES = [
  {
    label: 'flux-2-klein-4b (fast, default)',
    body: {
      prompt: 'mountain river forest',
      model: '@cf/black-forest-labs/flux-2-klein-4b',
      width: 1024,
      height: 1024,
      steps: 4
    }
  },
  {
    label: 'flux-2-dev (high quality, steps > 8)',
    body: {
      prompt: 'mountain river forest',
      model: '@cf/black-forest-labs/flux-2-dev',
      width: 1024,
      height: 1024,
      steps: 20
    }
  }
];

// Test function
async function testFluxAPI(testCase) {
  console.log(`\n=== ${testCase.label} ===`);
  console.log(`Testing API call to ${WORKER_URL}`);
  console.log('Request data:', JSON.stringify(testCase.body, null, 2));

  try {
    // Make API call
    const response = await fetch(WORKER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${FLUX_TOKEN}`
      },
      body: JSON.stringify(testCase.body)
    });

    console.log(`Response status: ${response.status} ${response.statusText}`);

    // Get response text for debugging
    const responseText = await response.text();
    console.log('Response text:', responseText);

    if (!response.ok) {
      console.log(`API error: ${response.status} - ${responseText}`);
      return;
    }

    // Try to parse JSON
    try {
      const data = JSON.parse(responseText);
      console.log('Successfully parsed response as JSON');
      console.log('Response data:', data);
    } catch (err) {
      console.log('Failed to parse response as JSON:', err.message);
    }
  } catch (error) {
    console.log('Error calling API:', error.message);
  }
}

// Run tests sequentially
(async () => {
  for (const testCase of TEST_CASES) {
    await testFluxAPI(testCase);
  }
  console.log('\nAPI test complete');
})();
