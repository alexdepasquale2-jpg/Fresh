Each `*.ts` file here that exports `plugin: Plugin` (see `../plugins.ts`) is loaded at boot.
Keep each plugin self-contained: its own file, and its own CSS imported from that file.
