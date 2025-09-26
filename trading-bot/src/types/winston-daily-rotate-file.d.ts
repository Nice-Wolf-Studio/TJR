declare module 'winston-daily-rotate-file' {
  import type { TransportStreamOptions } from 'winston-transport';
  import TransportStream = require('winston-transport');

  interface DailyRotateFileOptions extends TransportStreamOptions {
    filename?: string;
    datePattern?: string;
    maxFiles?: string | number;
    maxSize?: string | number;
    level?: string;
    format?: any;
  }

  class DailyRotateFile extends TransportStream {
    constructor(options?: DailyRotateFileOptions);
  }

  export = DailyRotateFile;
}
