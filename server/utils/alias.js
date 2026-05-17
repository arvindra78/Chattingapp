const prefixes = ['Shadow', 'Iron', 'Black', 'Silent', 'Swift', 'Ghost', 'Dark', 'Nova', 'Void', 'Alpha'];
const suffixes = ['Pulse', 'Ghost', 'Zero', 'Edge', 'Core', 'Vortex', 'Phantom', 'Storm', 'Blade', 'Cipher'];

const generateAlias = () => {
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
  const number = Math.floor(Math.random() * 900) + 100;
  return `${prefix}${suffix}${number}`;
};

const generateFitId = () => {
  return 'FIT-' + Math.random().toString(36).substr(2, 9).toUpperCase();
};

module.exports = { generateAlias, generateFitId };
