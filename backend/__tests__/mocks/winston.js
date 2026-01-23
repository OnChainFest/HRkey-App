const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  verbose: 4,
  debug: 5,
  silly: 6,
};

export default {
  config: {
    npm: { levels },
  },
  createLogger: () => ({
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    child: () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }),
    add: () => {},
  }),
  format: {
    combine: () => ({}),
    timestamp: () => ({}),
    json: () => ({}),
    printf: () => ({}),
    colorize: () => ({}),
    errors: () => ({}),
    splat: () => ({}),
  },
  transports: {
    Console: function Console() {},
    File: function File() {},
  },
};
