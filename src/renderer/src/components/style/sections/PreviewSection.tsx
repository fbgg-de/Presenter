import { Button, Stack, TextField, Typography } from '@mui/material';
import { RestartAlt as ResetIcon } from '@mui/icons-material';
import { PropCard } from '@/components/style/StyleFormPrimitives';
import type { StyleFormCtx } from '@/components/style/styleFormContext';
import { freshStylePreview, useGetSettings, useUpdateSetting, type StylePreviewSample } from '@/store/settingsSlice';
import { MAIN_LANGUAGE_SLOT } from '@/utils/languageSlots';

/**
 * Preview: the sample content the preview canvases draw.
 *
 * Kept out of the style itself — this is a per-device preference about what *you* want to look
 * at, and writing it into the style would push sample lyrics to every presentation window.
 *
 * The list is indexed by language slot, not by language name, so the sample follows whatever
 * slots the style defines. Which canvases are shown, and in what order, is set from the control
 * beside the Preview heading rather than here, since that is where you are looking when you
 * want to change it.
 */
export const PreviewSection = ({ ctx }: { ctx: StyleFormCtx }) => {
  const { LL } = ctx;
  const { stylePreview } = useGetSettings();
  const updateSetting = useUpdateSetting();

  const write = (patch: Partial<StylePreviewSample>) => updateSetting('stylePreview', { ...stylePreview, ...patch });

  const setLanguage = (index: number, patch: Partial<StylePreviewSample['languages'][number]>) =>
    write({ languages: stylePreview.languages.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)) });

  return (
    <>
      <PropCard title={LL.STYLE.PREVIEW_LINES()}>
        <Stack spacing={2} sx={{ px: 1, py: 0.5 }}>
          {stylePreview.languages.map((entry, index) => (
            <Stack key={index} spacing={0.75}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', flexGrow: 1 }}>
                  {index === 0 ? LL.STYLE.SLOT_MAIN() : LL.STYLE.SLOT_LABEL({ n: index + MAIN_LANGUAGE_SLOT })}
                </Typography>
                <TextField
                  size="small"
                  value={entry.code}
                  onChange={(e) => setLanguage(index, { code: e.target.value.toUpperCase().slice(0, 5) })}
                  sx={{ width: 90, '& input': { fontFamily: 'monospace' } }}
                  slotProps={{ htmlInput: { 'aria-label': LL.STYLE.PREVIEW_LANG_CODE() } }}
                />
              </Stack>
              {/* One box per language rather than one per line: a verse is pasted in one go,
                  and the line count then follows the text instead of being set separately. */}
              <TextField
                size="small"
                fullWidth
                multiline
                minRows={2}
                value={entry.lines.join('\n')}
                onChange={(e) => setLanguage(index, { lines: e.target.value.split('\n') })}
                placeholder={LL.STYLE.PREVIEW_LINES_PLACEHOLDER()}
              />
            </Stack>
          ))}
        </Stack>
      </PropCard>

      <PropCard title={LL.STYLE.SECTION_COPYRIGHT()}>
        <Stack spacing={1} sx={{ px: 1, py: 0.5 }}>
          <TextField
            size="small"
            fullWidth
            label={LL.COMMON.TITLE()}
            value={stylePreview.title}
            onChange={(e) => write({ title: e.target.value })}
          />
          <TextField
            size="small"
            fullWidth
            label={LL.COMMON.AUTHORS()}
            value={stylePreview.authors}
            onChange={(e) => write({ authors: e.target.value })}
          />
          <TextField
            size="small"
            fullWidth
            label={LL.COMMON.COPYRIGHT()}
            value={stylePreview.copyright}
            onChange={(e) => write({ copyright: e.target.value })}
          />
        </Stack>
      </PropCard>

      <PropCard>
        <Button
          size="small"
          variant="outlined"
          startIcon={<ResetIcon />}
          onClick={() => updateSetting('stylePreview', freshStylePreview())}
        >
          {LL.STYLE.PREVIEW_RESET()}
        </Button>
      </PropCard>
    </>
  );
};
