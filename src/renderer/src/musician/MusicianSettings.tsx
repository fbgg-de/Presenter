import { useMemo } from 'react';
import {
  Drawer,
  Stack,
  Typography,
  Divider,
  Switch,
  TextField,
  Autocomplete,
  Slider,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import { createFilterOptions } from '@mui/material/Autocomplete';
import {
  DarkMode as DarkModeIcon,
  LightMode as LightModeIcon,
  FormatSize as FormatSizeIcon,
  TextFields as TextFieldsIcon,
  Visibility as VisibilityIcon,
  QrCode2 as QrCodeIcon,
  PictureAsPdf as PdfIcon,
  ListAlt as ListAltIcon,
  Cable as MidiIcon,
} from '@mui/icons-material';
import { useUpdateMusicianSetting } from '@/store/musicianSlice';
import { useI18nContext } from '@/i18n/i18n-react';

type SettingRowProps = {
  icon: any;
  label: any;
  onClick?: () => void;
  switchChecked?: boolean;
  onSwitchChange?: (checked: boolean) => void;
};

const Setting = ({ icon, label, onClick, switchChecked, onSwitchChange }: SettingRowProps) => (
  <Stack direction="row" spacing={1} sx={{ alignItems: 'center', cursor: onClick ? 'pointer' : 'default' }} onClick={onClick}>
    {icon}
    <Typography
      variant="body2"
      sx={{
        fontWeight: 600,
        flex: 1,
      }}
    >
      {label}
    </Typography>
    {onSwitchChange && (
      <Switch
        size="small"
        checked={!!switchChecked}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onSwitchChange?.((e.target as HTMLInputElement).checked)}
      />
    )}
  </Stack>
);

interface MusicianSettingsProps {
  open: boolean;
  onClose: () => void;
  musicianName: string;
  musicianBand: string;
  musicianTheme: 'light' | 'dark';
  defaultPageView: 'one-page' | 'two-page';
  blockIndicator: boolean;
  textSize: number;
  showFooter: boolean;
  musicianNames: string[];
  availableBands: string[];
  setQrOpen: (open: boolean) => void;
  setPdfUploadOpen: (open: boolean) => void;
  onOpenMidiSettings: () => void;
}

export const MusicianSettings = ({
  open,
  onClose,
  musicianName,
  musicianBand,
  musicianTheme,
  defaultPageView,
  blockIndicator,
  textSize,
  showFooter,
  musicianNames,
  availableBands,
  setQrOpen,
  setPdfUploadOpen,
  onOpenMidiSettings,
}: MusicianSettingsProps) => {
  const { LL } = useI18nContext();
  const autocompleteFilter = useMemo(() => createFilterOptions<string>(), []);

  const updateMusicianSetting = useUpdateMusicianSetting();

  return (
    <Drawer anchor="right" open={open} onClose={onClose}>
      <Stack sx={{ width: 320, p: 2, height: '100%' }} spacing={2.5}>
        <Typography
          variant="h6"
          sx={{
            fontWeight: 700,
          }}
        >
          {LL.MUSICIAN.SETTINGS()}
        </Typography>
        <Divider />

        <Setting
          icon={musicianTheme === 'dark' ? <DarkModeIcon fontSize="small" /> : <LightModeIcon fontSize="small" />}
          label={musicianTheme === 'dark' ? LL.MUSICIAN.DARK_MODE() : LL.MUSICIAN.LIGHT_MODE()}
          switchChecked={musicianTheme === 'dark'}
          onSwitchChange={(checked) => updateMusicianSetting('musicianTheme', checked ? 'dark' : 'light')}
        />

        <Setting
          icon={<VisibilityIcon fontSize="small" />}
          label={LL.MUSICIAN.BLOCK_INDICATOR()}
          switchChecked={blockIndicator}
          onSwitchChange={(checked) => updateMusicianSetting('musicianBlockIndicator', checked)}
        />

        <Setting
          icon={<ListAltIcon fontSize="small" />}
          label={LL.MUSICIAN.SHOW_FOOTER()}
          switchChecked={showFooter}
          onSwitchChange={(checked) => updateMusicianSetting('musicianShowFooter', checked)}
        />

        <Divider />

        {/* Default page view */}
        <FormControl size="small" fullWidth>
          <InputLabel>{LL.MUSICIAN.DEFAULT_PAGE_MODE()}</InputLabel>
          <Select
            value={defaultPageView}
            label={LL.MUSICIAN.DEFAULT_PAGE_MODE()}
            onChange={(e) => updateMusicianSetting('musicianPageView', e.target.value as any)}
          >
            <MenuItem value="one-page">{LL.MUSICIAN.PAGE_ONE()}</MenuItem>
            <MenuItem value="two-page">{LL.MUSICIAN.PAGE_TWO()}</MenuItem>
          </Select>
        </FormControl>
        <Divider />

        {/* Musician name */}
        <Autocomplete
          freeSolo
          size="small"
          value={musicianName || null}
          options={musicianNames}
          onChange={(_e, newValue) => {
            if (typeof newValue === 'string') {
              updateMusicianSetting('musicianName', newValue);
            } else {
              updateMusicianSetting('musicianName', newValue ?? '');
            }
          }}
          filterOptions={(options, params) => {
            const filtered = autocompleteFilter(options, params);
            const { inputValue } = params;
            const isExisting = options.some((option) => inputValue === option);
            if (inputValue !== '' && !isExisting) {
              filtered.push(inputValue);
            }
            return filtered;
          }}
          renderOption={(props, option) => {
            const isNew = !musicianNames.includes(option);
            return (
              <li {...props} key={option}>
                {isNew ? `Add "${option}"` : option}
              </li>
            );
          }}
          renderInput={(params) => <TextField {...params} label={LL.MUSICIAN.NAME_SELECT()} placeholder={LL.MUSICIAN.ADD_NAME()} />}
        />

        {/* Band / Order select */}
        <FormControl size="small" fullWidth>
          <InputLabel>{LL.MUSICIAN.BAND_SELECT()}</InputLabel>
          <Select
            value={musicianBand || 'Default'}
            label={LL.MUSICIAN.BAND_SELECT()}
            onChange={(e) => updateMusicianSetting('musicianBand', e.target.value as string)}
          >
            {availableBands.map((b) => (
              <MenuItem key={b} value={b}>
                {b}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Divider />

        {/* Text size */}
        <Stack spacing={1}>
          <Stack
            direction="row"
            spacing={1}
            sx={{
              alignItems: 'center',
            }}
          >
            <FormatSizeIcon fontSize="small" color="action" />
            <Typography
              variant="body2"
              sx={{
                fontWeight: 600,
              }}
            >
              {LL.MUSICIAN.TEXT_SIZE()}
            </Typography>
          </Stack>
          <Stack
            direction="row"
            spacing={2}
            sx={{
              alignItems: 'center',
            }}
          >
            <TextFieldsIcon fontSize="small" sx={{ opacity: 0.5, fontSize: '0.9rem' }} />
            <Slider
              value={textSize}
              min={10}
              max={32}
              step={1}
              valueLabelDisplay="auto"
              valueLabelFormat={(v) => `${v}px`}
              onChange={(_e, val) => updateMusicianSetting('musicianTextSize', val as number)}
              sx={{ flex: 1 }}
            />
            <TextFieldsIcon fontSize="small" sx={{ opacity: 0.5, fontSize: '1.3rem' }} />
          </Stack>
        </Stack>

        <Divider />

        <Setting
          icon={<MidiIcon fontSize="small" />}
          label={LL.REMOTE.TITLE()}
          onClick={() => {
            onOpenMidiSettings();
            onClose();
          }}
        />

        <Setting
          icon={<PdfIcon fontSize="small" />}
          label={LL.PDF.MANAGE_TITLE()}
          onClick={() => {
            setPdfUploadOpen(true);
            onClose();
          }}
        />

        <Setting
          icon={<QrCodeIcon fontSize="small" />}
          label={LL.QR.SHARE_TITLE()}
          onClick={() => {
            setQrOpen(true);
            onClose();
          }}
        />
      </Stack>
    </Drawer>
  );
};
