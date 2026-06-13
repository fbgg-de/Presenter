/**
 * ChurchToolsArrangementPanel
 *
 * Shown in the musician view when ChurchTools is enabled and the active song has
 * a matching ChurchTools song (matched by CCLI number).
 *
 * Features:
 *  - Lists all arrangements for the song (key, beat, tempo, description)
 *  - Lets the musician select the active arrangement
 *  - Shows attached files (chords, lead sheets, …) with a direct download button
 */
import { useState } from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Download as DownloadIcon,
  MusicNote as MusicNoteIcon,
  ExpandMore as ExpandIcon,
  ExpandLess as CollapseIcon,
} from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import { useGetChurchToolsSongQuery, buildCtFileDownloadUrl } from '@/api/churchtools.api';
import type { CtArrangement } from '@/api/churchtools.api';

interface ChurchToolsArrangementPanelProps {
  /** ChurchTools song ID (from the search result). */
  ctSongId: number;
  /** Song name for the heading. */
  songName: string;
}

export const ChurchToolsArrangementPanel = ({ ctSongId, songName }: ChurchToolsArrangementPanelProps) => {
  const { LL } = useI18nContext();

  const { data, isLoading, isError } = useGetChurchToolsSongQuery({ ctSongId });

  const [selectedArrangementId, setSelectedArrangementId] = useState<number | null>(null);
  const [expandedArrangementId, setExpandedArrangementId] = useState<number | null>(null);

  if (isLoading) {
    return (
      <Stack sx={{ p: 2, alignItems: 'center', gap: 1 }}>
        <CircularProgress size={24} />
        <Typography variant="caption" color="text.secondary">
          {LL.CHURCH_TOOLS.LOADING()}
        </Typography>
      </Stack>
    );
  }

  if (isError || !data) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="body2" color="error">
          {LL.CHURCH_TOOLS.ERROR()}
        </Typography>
      </Box>
    );
  }

  const arrangements: CtArrangement[] = data.arrangements ?? [];

  if (arrangements.length === 0) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="body2" color="text.secondary">
          {LL.CHURCH_TOOLS.NO_RESULTS()}
        </Typography>
      </Box>
    );
  }

  const selectedArr = arrangements.find((a) => a.id === selectedArrangementId) ?? arrangements[0];
  const expanded = expandedArrangementId;

  return (
    <Stack sx={{ width: '100%' }}>
      <Typography variant="subtitle2" sx={{ px: 2, pt: 1, pb: 0.5, fontWeight: 700 }}>
        {LL.CHURCH_TOOLS.SONG_DETAIL_TITLE()} — {songName}
      </Typography>
      <Divider />

      {/* Arrangement selector */}
      <Typography variant="caption" sx={{ px: 2, pt: 1, color: 'text.secondary', textTransform: 'uppercase' }}>
        {LL.CHURCH_TOOLS.ARRANGEMENTS()}
      </Typography>

      <List dense disablePadding>
        {arrangements.map((arr) => {
          const isSelected = arr.id === selectedArr.id;
          const isExpanded = expanded === arr.id;
          const hasFiles = arr.files.length > 0;

          return (
            <Box key={arr.id}>
              <ListItem
                disablePadding
                secondaryAction={
                  hasFiles ? (
                    <IconButton
                      size="small"
                      onClick={() => setExpandedArrangementId(isExpanded ? null : arr.id)}
                      aria-label={isExpanded ? LL.COMMON.CLOSE() : LL.CHURCH_TOOLS.FILES()}
                    >
                      {isExpanded ? <CollapseIcon fontSize="small" /> : <ExpandIcon fontSize="small" />}
                    </IconButton>
                  ) : undefined
                }
              >
                <ListItemButton
                  selected={isSelected}
                  onClick={() => {
                    setSelectedArrangementId(arr.id);
                    if (!isExpanded && hasFiles) setExpandedArrangementId(arr.id);
                  }}
                  dense
                >
                  <ListItemText
                    primary={
                      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                        <MusicNoteIcon sx={{ fontSize: '0.9rem', color: 'text.secondary' }} />
                        <Typography variant="body2" noWrap sx={{ fontWeight: isSelected ? 600 : 400 }}>
                          {arr.name}
                        </Typography>
                      </Stack>
                    }
                    secondary={
                      <Stack direction="row" spacing={0.5} sx={{ mt: 0.25 }}>
                        {arr.key && <Chip label={arr.key} size="small" color="primary" sx={{ height: 16, fontSize: '0.65rem' }} />}
                        {arr.beat && <Chip label={arr.beat} size="small" variant="outlined" sx={{ height: 16, fontSize: '0.65rem' }} />}
                        {arr.tempo && (
                          <Chip label={`${arr.tempo} BPM`} size="small" variant="outlined" sx={{ height: 16, fontSize: '0.65rem' }} />
                        )}
                      </Stack>
                    }
                  />
                </ListItemButton>
              </ListItem>

              {/* File list (expanded) */}
              {isExpanded && hasFiles && (
                <Box sx={{ pl: 3, pr: 1, pb: 1 }}>
                  {arr.files.map((file) => (
                    <Stack key={file.filename} direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', py: 0.25 }}>
                      <Typography variant="caption" noWrap sx={{ flex: 1, color: 'text.secondary' }}>
                        {file.filename}
                      </Typography>
                      <Tooltip title={LL.CHURCH_TOOLS.DOWNLOAD()}>
                        <Button
                          size="small"
                          startIcon={<DownloadIcon sx={{ fontSize: '0.85rem' }} />}
                          component="a"
                          href={buildCtFileDownloadUrl(ctSongId, arr.id, file.filename)}
                          download={file.filename}
                          sx={{ minWidth: 0, fontSize: '0.7rem', ml: 1 }}
                        >
                          {LL.CHURCH_TOOLS.DOWNLOAD()}
                        </Button>
                      </Tooltip>
                    </Stack>
                  ))}
                </Box>
              )}
              <Divider component="li" />
            </Box>
          );
        })}
      </List>
    </Stack>
  );
};
