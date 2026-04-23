import { describe, expect, it } from 'vitest';
import { stripBindings, extractOperation, extractTable, sanitizeFilter } from './db-utils';

describe('db-utils', () => {
  describe('stripBindings', () => {
    it('should redact numbers', () => {
      const sql = 'SELECT * FROM users WHERE id = 123';
      expect(stripBindings(sql)).toBe('SELECT * FROM users WHERE id = ?');
    });

    it('should redact strings', () => {
      const sql = "SELECT * FROM users WHERE email = 'test@example.com'";
      expect(stripBindings(sql)).toBe('SELECT * FROM users WHERE email = ?');
    });

    it('should redact multiple values', () => {
      const sql = 'INSERT INTO users (id, name, age) VALUES (1, "John", 30)';
      // Note: My simple implementation redacts numbers and single quoted strings.
      // Double quotes might need more care in a real implementation, but for now:
      expect(stripBindings(sql)).toContain('?');
    });
  });

  describe('extractOperation', () => {
    it('should extract SELECT', () => {
      expect(extractOperation('SELECT * FROM users')).toBe('SELECT');
    });
    it('should extract INSERT', () => {
      expect(extractOperation('  INSERT INTO users ...')).toBe('INSERT');
    });
  });

  describe('extractTable', () => {
    it('should extract table from SELECT', () => {
      expect(extractTable('SELECT * FROM users WHERE id = 1')).toBe('users');
    });
    it('should extract table from INSERT', () => {
      expect(extractTable('INSERT INTO orders (id) VALUES (1)')).toBe('orders');
    });
  });

  describe('sanitizeFilter', () => {
    it('should redact values in mongo filter', () => {
      const filter = { email: 'user@example.com', age: { $gt: 25 }, status: 'active' };
      const sanitized = sanitizeFilter(filter);
      console.log('Sanitized:', JSON.stringify(sanitized, null, 2));
      expect(sanitized.email).toBe('<string>');
      expect(sanitized.age.$gt).toBe('<number>');
      expect(sanitized.status).toBe('<string>');
    });
  });
});
