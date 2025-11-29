export enum LogLevel {
    /**
     * The most verbose logging level. Logs everything, including debug messages.
     */
    Debug = 1,
    /**
     * The default logging level. Logs info, warning, and error messages.
     */
    Info = 2,
    /**
     * The second least verbose logging level. Only logs warnings and error messages.
     */
    Warn = 3,
    /**
     * The least verbose logging level. Only logs error messages.
     */
    Error = 4,
}

export enum FileWriteStreamMode {
    /**
     * Will create a new log file or append to an existing one
     */
    Append = 'Append',
    /**
     * Will clear the existing log file and create a new one
     */
    Truncate = 'Truncate',
    /**
     * Will create a new log file and rename the existing one
     */
    Rename = 'Rename'
}