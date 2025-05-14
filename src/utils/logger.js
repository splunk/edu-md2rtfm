const logger = {
  info: (msg) => console.log(`ℹ️  ${msg}`),
  debug: (msg) => console.debug(`🐛 ${msg}`),
  error: (msg) => console.error(`❌ ${msg}`),
  warn: (msg) => console.warn(`⚠️  ${msg}`),
  log: (msg) => console.log(msg),
};

export default logger;
