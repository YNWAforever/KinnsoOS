import '@testing-library/jest-dom/vitest'
globalThis.fetch=async()=>{throw new Error('Unexpected network request in offline studio tests')}
