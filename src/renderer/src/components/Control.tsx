import { Stack, Typography } from '@mui/material';
import { useI18nContext } from '@/i18n/i18n-react';
import { useAppSelector } from '@/store';
import ControlSong from '@/components/ControlSong';
import ControlBibleVerse from '@/components/ControlBibleVerse';
import ControlMedia from '@/components/ControlMedia';

const Control = () => {
  const { LL } = useI18nContext();
  const activeItemIndex = useAppSelector((state) => state.presentation.activeItemIndex);
  const currentShow = useAppSelector((state) => state.show.currentShow);

  // Get the active show item
  const activeItem = currentShow?.order?.[activeItemIndex];

  // No show loaded or no items
  if (!currentShow || !currentShow.order || currentShow.order.length === 0) {
    return (
      <Stack sx={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Typography color="text.secondary">{LL.CONTROL_NO_ITEM()}</Typography>
      </Stack>
    );
  }

  // No active item selected
  if (!activeItem) {
    return (
      <Stack sx={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Typography color="text.secondary">{LL.CONTROL_NO_ITEM()}</Typography>
      </Stack>
    );
  }

  // Dispatch to sub-component based on item type
  switch (activeItem.type) {
    case 'song':
      return <ControlSong />;
    case 'bible_verse':
      return <ControlBibleVerse item={activeItem} />;
    case 'media':
      return <ControlMedia item={activeItem} />;
    default:
      return <ControlSong />;
  }
};

export default Control;
