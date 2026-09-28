// Return a small response used to verify that the API is running.
function getHealthStatus(request, response) {
  response.json({ status: 'ok', service: 'prism-api' });
}

export { getHealthStatus };