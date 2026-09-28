/** Android/iOS/Quest SAF picker: let the native change/cancel event settle the request. */
import { createFileInput, openLegacyFilePicker } from './picker-base.js';

/** Open the full system picker, allowing cloud providers to finish downloading files. */
export const openFilePicker = async (options = {}, dependencies = {}) => {
    const inputId = dependencies.UI_CONSTANTS?.DOM_IDS?.LEGACY_FILE_INPUT || 'legacy-file-input-fallback';
    const input = createFileInput(inputId, '', options.multiple !== false, true);
    return openLegacyFilePicker(input);
};
