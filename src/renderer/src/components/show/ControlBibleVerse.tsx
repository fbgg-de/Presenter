import { memo } from 'react';
import { Card, CardContent, CardMedia, Stack, Typography, Chip } from '@mui/material';
import { MenuBook as MenuBookIcon } from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import type { ShowItem } from '@/api/shows.api';

interface ControlBibleVerseProps {
  item: ShowItem;
}

const ControlBibleVerse = ({ item }: ControlBibleVerseProps) => {
  const { LL } = useI18nContext();

  return (
    <Stack
      sx={{
        flexGrow: 1,
        padding: '0 25px 20px',
        overflowY: 'auto',
        userSelect: 'none',
      }}
    >
      <Card sx={{ border: `1px solid #388e3c` }}>
        <CardMedia sx={{ background: '#388e3c' }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ padding: '6px 12px' }}>
            <MenuBookIcon sx={{ color: '#fff' }} />
            <Typography variant="h6" sx={{ color: '#fff' }}>
              {item.bibleRef || LL.BIBLE.VERSE()}
            </Typography>
          </Stack>
        </CardMedia>
        <CardContent>
          {item.bibleTranslation && <Chip label={item.bibleTranslation} size="small" color="success" sx={{ mb: 2 }} />}
          <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.8 }}>
            {item.label || item.bibleRef || LL.BIBLE.NO_RESULTS()}
          </Typography>
        </CardContent>
      </Card>
    </Stack>
  );
};

export default memo(ControlBibleVerse);
