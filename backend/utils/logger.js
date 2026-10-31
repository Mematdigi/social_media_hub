const logger = {
  info: (emoji, message) => {
    console.log(`${new Date().toISOString()} - ${emoji} ${message}`);
  },
  error: (message, error) => {
    console.error(`${new Date().toISOString()} - ❌ ${message}`, error?.message || error);
  },
  success: (message) => {
    console.log(`${new Date().toISOString()} - ✅ ${message}`);
  }
};

module.exports = logger;
