import { validateName, namehash } from './'

test('validateName returns true for valid names', () => {
  expect(validateName('vitalik')).toBe('vitalik')
  expect(validateName('Vitalik')).toBe('vitalik')
  expect(validateName('Vitalik.one')).toBe('vitalik.one')
  expect(validateName('sub.Vitalik.one')).toBe('sub.vitalik.one')
})

test('validateName returns false for invalid names', () => {
  expect(() => validateName('$vitalik')).toThrowError('Illegal char $')
  expect(() => validateName('#vitalik')).toThrowError('Illegal char #')
  expect(() => validateName('vitalik ')).toThrowError('Illegal char ')
})
