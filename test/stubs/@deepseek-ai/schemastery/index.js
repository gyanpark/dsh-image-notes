// Minimal stand-in for tests only; the real package is supplied by DeepSeek Harness at runtime.
const chain = () => { const o = { default: () => o, description: () => o, min: () => o }; return o }
export default { object: (shape) => ({ shape }), string: chain, boolean: chain, number: chain }
