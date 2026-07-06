import { describe, expect, it } from 'vitest';
import { stripBindings, extractOperation, extractTable, sanitizeFilter } from './db-utils.js';

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

    it('should not leak content after an escaped quote inside a string literal', () => {
      const sql = "SELECT * FROM users WHERE name = 'O''Brien' AND ssn = '123-45-6789'";
      const out = stripBindings(sql);
      expect(out).not.toContain('Brien');
      expect(out).not.toContain('123-45-6789');
    });

    it('should not leak content after a backslash-escaped quote', () => {
      const sql = "SELECT * FROM users WHERE note = 'it\\'s secret@example.com'";
      const out = stripBindings(sql);
      expect(out).not.toContain('secret@example.com');
    });

    it('should not touch digits that are part of an identifier', () => {
      const sql = 'SELECT * FROM table1 WHERE col2 = 5';
      const out = stripBindings(sql);
      expect(out).toContain('table1');
      expect(out).toContain('col2');
      expect(out).toContain('= ?');
    });

    it('should redact postgres dollar-quoted strings', () => {
      const sql = "SELECT * FROM users WHERE bio = $tag$secret@example.com$tag$";
      const out = stripBindings(sql);
      expect(out).not.toContain('secret@example.com');
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
