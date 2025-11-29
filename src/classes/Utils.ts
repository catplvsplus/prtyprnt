import kleur from 'kleur';
import type { Stats } from 'node:fs';
import { readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { brotliCompress, gzip } from 'node:zlib';
import inspector from 'node:inspector';

export class Utils {
    private constructor() {}
}

export namespace Utils {
    export function supportsColor(): boolean {
        return kleur.enabled;
    }

    export function isDebugging(): boolean {
        return process.env.NODE_ENV === 'development' || (!!inspector.url() || /--debug|--inspect/g.test(process.execArgv.join('')));
    }

    export async function getFileCreationDate(file: string, options?: { statData?: Stats; lines?: string[] }): Promise<Date> {
        const statData = options?.statData ?? await stat(file);
        const lines = options?.lines ?? (await readFile(file, 'utf-8')).split('\n');

        let createdAt: Date = statData.birthtimeMs ? statData.birthtime : statData.ctime;
        const header = lines[0].trim();

        if (header && header.startsWith('[') && header.endsWith(']')) {
            const timestamp = header.substring(1, header.length - 1);

            createdAt = new Date(timestamp);
        }

        return createdAt;
    }

    export async function gzipCompressLog(file: string, statData: Stats): Promise<void> {
        const filePathInfo = path.parse(file);
        const lines = (await readFile(file, 'utf-8')).split('\n');
        const createdAt = await Utils.getFileCreationDate(file, { statData, lines });
        const newFile = path.join(filePathInfo.dir, `${Utils.formatDateFileName(createdAt)}${filePathInfo.ext}.gz`);

        const data = await new Promise<Buffer>((resolve, reject) => gzip(
                Uint8Array.from(Buffer.from(lines.join('\n'), 'utf-8')),
                (error, result) => {
                    if (error) return reject(error);
                    resolve(result);
                }
            )
        );

        await writeFile(file, data.toString('utf-8'));
        await rename(file, newFile);
    }

    export async function brotliCompressLog(file: string, statData: Stats): Promise<void> {
        const filePathInfo = path.parse(file);
        const lines = (await readFile(file, 'utf-8')).split('\n');
        const createdAt = await Utils.getFileCreationDate(file, { statData, lines });
        const newFile = path.join(filePathInfo.dir, `${Utils.formatDateFileName(createdAt)}${filePathInfo.ext}.br`);

        const data = await new Promise<Buffer>((resolve, reject) => brotliCompress(
                Uint8Array.from(Buffer.from(lines.join('\n'), 'utf-8')),
                (error, result) => {
                    if (error) return reject(error);
                    resolve(result);
                }
            )
        );

        await writeFile(file, data.toString('utf-8'));
        await rename(file, newFile);
    }

    export function formatDateFileName(date: Date): string {
        return `${date.toISOString().substring(0, 10)}-${date.getHours()}-${date.getMinutes()}-${date.getSeconds()}-${date.getMilliseconds()}`;
    }

    export function logDateHeader(date: Date): string {
        return `[${date.toISOString()}]`;
    }
}