import EventEmitter from 'node:events';
import { Formatter } from './Formatter.js';
import { createWriteStream, WriteStream, type Stats } from 'node:fs';
import { FileWriteStreamMode, LogLevel } from '../types/constants.js';
import { type InspectOptions } from 'node:util';
import path from 'node:path';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import type { BaseFormatter, FormatterFormatOptions } from './BaseFormatter.js';
import type { Args, Key } from '../types/types.js';
import { Utils } from './Utils.js';

export class Logger extends EventEmitter<Logger.Events> implements Logger.Options {
    private _writeStream?: WriteStream;

    public formatter: BaseFormatter;
    public parent?: Logger;
    public label?: string;
    public objectInspectOptions?: InspectOptions;
    public logLevel: LogLevel|null;
    public writeLevel: LogLevel|null;

    get writeStream(): WriteStream | undefined {
        return this._writeStream ?? this.parent?.writeStream;
    }

    set writeStream(value: WriteStream | undefined) {
        this._writeStream = value;
        if (this.parent && !this.parent?.writeStream) this.parent.writeStream = value;
    }

    get isWriteStreamClosed(): boolean {
        return !this.writeStream || this.writeStream.closed || this.writeStream.destroyed;
    }

    constructor(options?: Logger.Options) {
        super();

        this.formatter = options?.formatter ?? new Formatter();
        this.parent = options?.parent;
        this.label = options?.label;
        this.writeStream =options?.writeStream;
        this.objectInspectOptions = options?.objectInspectOptions;
        this.logLevel = options?.logLevel ?? LogLevel.Info;
        this.writeLevel = options?.writeLevel ?? options?.writeLevel !== null ? (options?.logLevel ?? LogLevel.Info) : null;

        this.error = this.error.bind(this);
        this.warning = this.warning.bind(this);
        this.info = this.info.bind(this);
        this.debug = this.debug.bind(this);
        this.log = this.log.bind(this);
        this.warn = this.warn.bind(this);
        this.err = this.err.bind(this);
        this.print = this.print.bind(this);
        this.createFileWriteStream = this.createFileWriteStream.bind(this);
        this.closeFileWriteStream = this.closeFileWriteStream.bind(this);
        this.clone = this.clone.bind(this);
    }

    /**
     * Output a log message at the error level
     */
    public error(...data: any[]): void {
        return this.print(LogLevel.Error, ...data);
    }

    /**
     * Output a log message at the warning level
     */
    public warning(...data: any[]): void {
        return this.print(LogLevel.Warn, ...data);
    }

    /**
     * Output a log message at the info level
     */
    public info(...data: any[]): void {
        return this.print(LogLevel.Info, ...data);
    }

    /**
     * Output a log message at the debug level
     */
    public debug(...data: any[]): void {
        return this.print(LogLevel.Debug, ...data);
    }

    /**
     * Output a log message at the info level
     */
    public log(...data: any[]): void {
        return this.info(...data);
    }

    /**
     * Output a log message at the warning level
     */
    public warn(...data: any[]): void {
        return this.warning(...data);
    }

    /**
     * Output a log message at the error level
     */
    public err(...data: any[]): void {
        return this.error(...data);
    }

    protected print(level: LogLevel, ...data: any[]): void {
        const options: FormatterFormatOptions = {
            level,
            messages: data,
            logger: this
        };

        const pretty = this.formatter.formatConsoleLog(options);
        const simple = this.formatter.formatWriteStreamLog(options);

        this.emit(level, {
            ...options,
            pretty,
            simple
        });

        if (this.logLevel && level >= this.logLevel) {
            switch (level) {
                case LogLevel.Debug:
                    console.debug(pretty);
                    break;
                case LogLevel.Info:
                    console.info(pretty);
                    break;
                case LogLevel.Warn:
                    console.warn(pretty);
                    break;
                case LogLevel.Error:
                    console.error(pretty);
                    break;
            }
        }

        if (!this.isWriteStreamClosed && this.writeLevel && level >= this.writeLevel) {
            this.writeStream?.write(`${simple}\n`, 'utf-8');
        }
    }

    public async createFileWriteStream(options: Logger.WriteStreamOptions): Promise<this> {
        if (!this.isWriteStreamClosed) {
            throw new Error('Write stream already created');
        }

        this.writeStream = await Logger.createFileWriteStream(options);
        return this;
    }

    public async closeFileWriteStream(): Promise<this> {
        await new Promise((resolve) => {
            if (!this.isWriteStreamClosed) {
                return resolve(this);
            }

            this.writeStream?.close(resolve);
        });

        return this;
    }

    public clone(options?: Logger.Options, inheritParent: boolean = true): Logger {
        return new Logger({
            ...this.toJSON(),
            parent: inheritParent ? this.parent : this,
            ...options
        });
    }

    public emit<K>(eventName: Key<K, Logger.Events>, ...args: Args<K, Logger.Events>): boolean {
        const result = super.emit<K>(eventName, ...args);
        if (this.parent) this.parent.emit(eventName, ...args);
        return result;
    }

    public toJSON(): Logger.Options {
        return {
            formatter: this.formatter,
            parent: this.parent,
            label: this.label,
            writeStream: this.writeStream,
            objectInspectOptions: this.objectInspectOptions,
            logLevel: this.logLevel,
            writeLevel: this.writeLevel
        };
    }

    public static async createFileWriteStream(options: Logger.WriteStreamOptions): Promise<WriteStream> {
        options.initialData ??= Utils.logDateHeader(new Date());

        const file = path.resolve(options.path);
        const filePathInfo = path.parse(file);
        const fileStat = await stat(file).catch(() => null);
        const initialData = (typeof options.initialData !== 'function'
            ? options.initialData ?? ''
            : await Promise.resolve(options.initialData(file))) + '\n';

        if (fileStat && !fileStat.isFile()) throw new Error('Write stream path is not a file');

        await mkdir(filePathInfo.dir, { recursive: true });

        switch (options.mode) {
            case FileWriteStreamMode.Append: break;
            case FileWriteStreamMode.Truncate:
                if (!fileStat) break;

                await writeFile(file, initialData, 'utf-8');
                break;
            case FileWriteStreamMode.Rename:
                if (!fileStat) break;

                if (options.renameFile) {
                    await Promise.resolve(options.renameFile(file, fileStat));
                } else {
                    await Utils.gzipCompressLog(file, fileStat);
                }

                const newStat = await stat(file).catch(() => null);
                if (!newStat) await writeFile(file, initialData, 'utf-8');
        }

        const writeStream = createWriteStream(file, {
            flags: options.mode === FileWriteStreamMode.Append ? 'a' : 'w',
            encoding: 'utf-8'
        });

        await new Promise((resolve) => writeStream.on('open', resolve));

        const content = await readFile(file, 'utf-8');
        if (options.initialData && !content) writeStream.write(initialData, 'utf-8');

        return writeStream;
    }
}

export namespace Logger {
    export interface Options {
        /**
         * The log formatter
         */
        formatter?: BaseFormatter;
        /**
         * The parent logger to inherit from
         */
        parent?: Logger;
        /**
         * The logger label
         */
        label?: string;
        /**
         * The log file write stream
         */
        writeStream?: WriteStream;
        /**
         * The object inspect options
         */
        objectInspectOptions?: InspectOptions;
        /**
         * The console log level
         * @default LogLevel.Info
         */
        logLevel?: LogLevel|null;
        /**
         * The log file write stream log level
         * @default LogLevel.Info
         */
        writeLevel?: LogLevel|null;
    }

    export interface WriteStreamOptions {
        path: string;
        mode: FileWriteStreamMode;
        renameFile?: (file: string, stat: Stats) => any;
        initialData?: string|((file: string) => string|Promise<string>);
    }

    export type Events = {
        [event in LogLevel]: [data: FormatterFormatOptions & { pretty: string; simple: string; }];
    }
}