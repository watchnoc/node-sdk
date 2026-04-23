import mongoose from 'mongoose';
import { Context } from '../../index.js';

export function instrumentMongoose(): void {
  const originalExec = mongoose.Query.prototype.exec;

  mongoose.Query.prototype.exec = function (this: mongoose.Query<any, any>, ...args: any[]) {
    const stack = new Error().stack ?? '';
    const caller = parseCallerFromStack(stack);

    Context.set({ querySource: caller });

    return (originalExec as any).apply(this, args);
  };
}

function parseCallerFromStack(stack: string): string {
  const frames = stack.split('\n').slice(1);
  const appFrame = frames.find(
    (f) => !f.includes('node_modules') && !f.includes('Watchnoc/') && !f.includes('internal/'),
  );
  if (!appFrame) return '';
  const match = appFrame.match(/\((.+):(\d+):\d+\)/);
  return match ? `${match[1]}:${match[2]}` : '';
}
