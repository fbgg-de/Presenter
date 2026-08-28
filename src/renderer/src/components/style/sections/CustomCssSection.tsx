import { Box, Button, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import { Code as CodeIcon, ContentCopy as DuplicateIcon } from '@mui/icons-material';
import { generateCssFromStyleData } from '@/components/style/styleFormUtils';
import { CssEditor } from '@/components/style/CssEditor';
import type { StyleFormCtx } from '@/components/style/styleFormContext';

/** Custom CSS: an escape hatch, plus a read-only view of the settings as CSS. */
export const CustomCssSection = ({ ctx }: { ctx: StyleFormCtx }) => {
  const { LL, styleData, setStyleData, setIsDirty, showGeneratedCss, setShowGeneratedCss, generatedCssCopied, setGeneratedCssCopied } = ctx;

  return (
    <>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }} useFlexGap>
        <Typography variant="body2" sx={{ color: 'text.secondary', flex: 1, minWidth: 120 }}>
          {LL.STYLE.CUSTOM_CSS()}
        </Typography>
        <Tooltip title={LL.STYLE.SHOW_GENERATED_CSS_HINT()}>
          <Button
            size="small"
            variant={showGeneratedCss ? 'contained' : 'outlined'}
            startIcon={<CodeIcon />}
            onClick={() => setShowGeneratedCss((v) => !v)}
          >
            {LL.STYLE.SHOW_GENERATED_CSS()}
          </Button>
        </Tooltip>
        <Tooltip title={LL.STYLE.INSERT_GENERATED_CSS_HINT()}>
          <Button
            size="small"
            variant="outlined"
            onClick={() => {
              const generated = generateCssFromStyleData(styleData);
              setStyleData((prev) => ({ ...prev, css: prev.css ? `${prev.css}\n\n${generated}` : generated }));
              setIsDirty(true);
            }}
          >
            {LL.STYLE.INSERT_GENERATED_CSS()}
          </Button>
        </Tooltip>
      </Stack>
      {/* Read-only view of the settings rendered as CSS — copyable to other styles */}
      {showGeneratedCss && (
        <Box sx={{ position: 'relative', mt: 1 }}>
          <CssEditor readOnly minRows={8} value={generateCssFromStyleData(styleData) || '/* no enabled settings */'} />
          <Tooltip title={generatedCssCopied ? LL.STYLE.CSS_COPIED() : LL.STYLE.COPY_CSS()}>
            <IconButton
              size="small"
              onClick={() => {
                void navigator.clipboard?.writeText(generateCssFromStyleData(styleData)).then(() => {
                  setGeneratedCssCopied(true);
                  setTimeout(() => setGeneratedCssCopied(false), 2000);
                });
              }}
              color={generatedCssCopied ? 'success' : 'default'}
              sx={{ position: 'absolute', top: 6, right: 6, bgcolor: 'background.paper', boxShadow: 1 }}
            >
              <DuplicateIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      )}
      <Box sx={{ mt: 1 }}>
        <CssEditor
          value={styleData.css || ''}
          onChange={(css) => {
            setStyleData((prev) => ({ ...prev, css }));
            setIsDirty(true);
          }}
          placeholder=".presentation-line { /* custom styles */ }"
        />
      </Box>
    </>
  );
};
