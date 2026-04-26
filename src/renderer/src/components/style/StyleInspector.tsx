import { useMemo } from 'react';
import type { LocalizedString } from 'typesafe-i18n';
import {
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Paper,
  Stack,
  Box,
} from '@mui/material';
import { useGetStylesQuery } from '@/api/styles.api';
import { useI18nContext } from '@/i18n/i18n-react';
import { resolveStyleData, DEFAULT_STYLE, type ResolvedStyle } from '@/utils/styleUtils';
import { useGetPresentationSettings } from '@/store/presentationSlice';
import { useGetSettings } from '@/store/settingsSlice';
import { useGetShow } from '@/store/showSlice';

interface StyleInspectorProps {
  open: boolean;
  onClose: () => void;
  onEditStyle?: (styleId: number) => void;
  windowName?: string;
}

type StyleLevel = 'Default' | 'Global' | 'Show' | 'Item';

interface InspectedProperty {
  name: string;
  value: string;
  source: StyleLevel;
  sourceStyleName: string | LocalizedString;
}

/**
 * Get the chip color for a style level.
 */
const getLevelColor = (level: StyleLevel): 'default' | 'primary' | 'secondary' | 'success' => {
  switch (level) {
    case 'Default':
      return 'default';
    case 'Global':
      return 'primary';
    case 'Show':
      return 'secondary';
    case 'Item':
      return 'success';
  }
};

/**
 * All inspectable property names.
 */
const PROPERTY_NAMES: (keyof ResolvedStyle)[] = [
  'backgroundColor',
  'backgroundImage',
  'backgroundVideo',
  'fontFamily',
  'fontFallback',
  'fontColor',
  'fontSize',
  'fontBold',
  'fontItalic',
  'fontUnderline',
  'lineHeight',
  'letterSpacing',
  'padding',
  'textTransform',
  'textAlign',
  'textStroke',
  'textShadow',
  'textShadowColor',
  'opacity',
  'hideText',
  'hideBackground',
  'nextLinePreviewColor',
];

export const StyleInspector = ({ open, onClose, onEditStyle, windowName }: StyleInspectorProps) => {
  const { LL } = useI18nContext();
  const { data: allStyles = [] } = useGetStylesQuery();

  const { globalStyleId } = useGetSettings();
  const { activeItemIndex } = useGetPresentationSettings();
  const { currentShow } = useGetShow();

  const activeItem = currentShow?.order?.[activeItemIndex];

  // Resolve each style level
  const showStyleId = currentShow?.styleId;
  const itemStyleId = activeItem?.styleId;

  const globalStyle = useMemo(() => allStyles.find((s) => s.id === globalStyleId), [allStyles, globalStyleId]);
  const showStyle = useMemo(() => allStyles.find((s) => s.id === showStyleId), [allStyles, showStyleId]);
  const itemStyle = useMemo(() => allStyles.find((s) => s.id === itemStyleId), [allStyles, itemStyleId]);

  // Build inspection data
  const inspectedProperties = useMemo(() => {
    // Localized formatter (depends on LL)
    const formatValue = (value: unknown): string => {
      if (value === undefined || value === null) return LL.STYLE.EMPTY();
      if (typeof value === 'boolean') return value ? LL.STYLE.BOOL_YES() : LL.STYLE.BOOL_NO();
      if (Array.isArray(value)) return value.join(', ');
      return String(value);
    };

    const sourceLabel = (level: StyleLevel) => {
      switch (level) {
        case 'Default':
          return LL.STYLE.LEVEL_DEFAULT();
        case 'Global':
          return LL.STYLE.LEVEL_GLOBAL();
        case 'Show':
          return LL.STYLE.LEVEL_SHOW();
        case 'Item':
          return LL.STYLE.LEVEL_ITEM();
      }
    };

    const defaultResolved = DEFAULT_STYLE;
    const globalResolved = resolveStyleData(globalStyle?.data);
    const showResolved = resolveStyleData(showStyle?.data);
    const itemResolved = resolveStyleData(itemStyle?.data);

    // Window overrides would be applied here
    // For now, we trace each property through the cascade

    const properties: InspectedProperty[] = [];

    for (const prop of PROPERTY_NAMES) {
      let value: unknown = defaultResolved[prop];
      let source: StyleLevel = 'Default';
      let sourceStyleName: string | LocalizedString = LL.STYLE.INSPECTOR_BUILTIN_DEFAULT();

      if (globalResolved[prop] !== undefined) {
        value = globalResolved[prop];
        source = 'Global';
        sourceStyleName = globalStyle?.name || sourceLabel('Global');
      }

      if (showResolved[prop] !== undefined) {
        value = showResolved[prop];
        source = 'Show';
        sourceStyleName = showStyle?.name || sourceLabel('Show');
      }

      if (itemResolved[prop] !== undefined) {
        value = itemResolved[prop];
        source = 'Item';
        sourceStyleName = itemStyle?.name || sourceLabel('Item');
      }

      if (value !== undefined) {
        properties.push({
          name: prop,
          value: formatValue(value),
          source,
          sourceStyleName,
        });
      }
    }

    return properties;
  }, [globalStyle, showStyle, itemStyle, LL]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography variant="h6">{LL.STYLE.INSPECTOR()}</Typography>
          {windowName && <Chip label={LL.STYLE.INSPECTOR_WINDOW({ name: windowName })} size="small" variant="outlined" />}
        </Stack>
      </DialogTitle>
      <DialogContent>
        {/* Style level summary */}
        <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
          <Box>
            <Typography variant="caption" color="text.secondary">
              {LL.STYLE.GLOBAL()}
            </Typography>
            <Typography variant="body2">{globalStyle?.name || `(${LL.STYLE.NONE()})`}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">
              {LL.STYLE.SHOW()}
            </Typography>
            <Typography variant="body2">{showStyle?.name || `(${LL.STYLE.NONE()})`}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">
              {LL.STYLE.ITEM()}
            </Typography>
            <Typography variant="body2">{itemStyle?.name || `(${LL.STYLE.NONE()})`}</Typography>
          </Box>
        </Stack>

        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>
                  <strong>{LL.STYLE.INSPECTOR_PROPERTY()}</strong>
                </TableCell>
                <TableCell>
                  <strong>{LL.STYLE.INSPECTOR_VALUE()}</strong>
                </TableCell>
                <TableCell>
                  <strong>{LL.STYLE.INSPECTOR_SOURCE()}</strong>
                </TableCell>
                <TableCell>
                  <strong>{LL.STYLE.INSPECTOR_STYLE()}</strong>
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {inspectedProperties.map((prop) => (
                <TableRow key={prop.name} hover>
                  <TableCell>
                    <Typography variant="body2" fontFamily="monospace" fontSize="0.8rem">
                      {prop.name}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={1} alignItems="center">
                      {/* Color swatch for color properties */}
                      {(prop.name.toLowerCase().includes('color') || prop.name === 'backgroundColor') && prop.value.startsWith('#') && (
                        <Box
                          sx={{
                            width: 16,
                            height: 16,
                            borderRadius: '50%',
                            backgroundColor: prop.value,
                            border: '1px solid',
                            borderColor: 'divider',
                            flexShrink: 0,
                          }}
                        />
                      )}
                      <Typography variant="body2" fontSize="0.85rem">
                        {prop.value}
                      </Typography>
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={
                        prop.source === 'Default'
                          ? LL.STYLE.LEVEL_DEFAULT()
                          : prop.source === 'Global'
                            ? LL.STYLE.LEVEL_GLOBAL()
                            : prop.source === 'Show'
                              ? LL.STYLE.LEVEL_SHOW()
                              : LL.STYLE.LEVEL_ITEM()
                      }
                      size="small"
                      color={getLevelColor(prop.source)}
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontSize="0.85rem">
                      {prop.sourceStyleName}
                    </Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </DialogContent>
      <DialogActions>
        {onEditStyle && globalStyle && (
          <Button size="small" onClick={() => onEditStyle(globalStyle.id)}>
            {LL.COMMON.EDIT()} {LL.STYLE.GLOBAL()}
          </Button>
        )}
        {onEditStyle && showStyle && (
          <Button size="small" onClick={() => onEditStyle(showStyle.id)}>
            {LL.COMMON.EDIT()} {LL.STYLE.SHOW()}
          </Button>
        )}
        {onEditStyle && itemStyle && (
          <Button size="small" onClick={() => onEditStyle(itemStyle.id)}>
            {LL.COMMON.EDIT()} {LL.STYLE.ITEM()}
          </Button>
        )}
        <Box flexGrow={1} />
        <Button onClick={onClose}>{LL.COMMON.CLOSE()}</Button>
      </DialogActions>
    </Dialog>
  );
};
