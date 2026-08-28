import { Button, Divider, FormControlLabel, MenuItem, Select, Slider, Stack, Switch, Typography } from '@mui/material';
import CompactPositionPicker from '@/components/common/CompactPositionPicker';
import { CardGrid, MediaPropRow, PropCard, StylePropRow, SubControlsRow } from '@/components/style/StyleFormPrimitives';
import { ColorSwatchButton } from '@/components/style/ColorPicker';
import type { StyleFormCtx } from '@/components/style/styleFormContext';

/** Background: the colour, image and video layers the text is drawn on top of. */
export const BackgroundSection = ({ ctx }: { ctx: StyleFormCtx }) => {
  const { LL, getProp, updateProp, togglePropEnabled, styleData, setStyleData, setIsDirty, handlePickImage, handlePickVideo } = ctx;
  const bgImageEnabled = getProp<string>('backgroundImage').enabled;
  const bgVideoEnabled = getProp<string>('backgroundVideo').enabled;
  const bgImageVal = getProp<string>('backgroundImage').value || '';
  const bgVideoVal = getProp<string>('backgroundVideo').value || '';

  return (
    <CardGrid>
      {/* Background color — always available as a base layer */}
      <PropCard span>
        <StylePropRow
          label={LL.STYLE.BACKGROUND_COLOR()}
          enabled={getProp<string>('backgroundColor').enabled}
          onToggle={(e) => togglePropEnabled('backgroundColor', e)}

          propKeys={['backgroundColor']}
        >
          <Stack
            direction="row"
            spacing={1}
            sx={{
              alignItems: 'center',
            }}
          >
            <ColorSwatchButton
              value={getProp<string>('backgroundColor').value || '#000000'}
              onChange={(c) => updateProp('backgroundColor', { enabled: true, value: c })}
            />
            <Button
              size="small"
              variant={getProp<string>('backgroundColor').value === 'transparent' ? 'contained' : 'outlined'}
              onClick={() => updateProp('backgroundColor', { enabled: true, value: 'transparent' })}
              sx={{ fontSize: '0.7rem', py: 0.25, px: 1, minWidth: 0 }}
            >
              {LL.STYLE.BACKGROUND_TRANSPARENT()}
            </Button>
          </Stack>
        </StylePropRow>
      </PropCard>

      {/* Image layer */}
      <PropCard>
        <MediaPropRow
          label={LL.STYLE.BACKGROUND_IMAGE()}
          enabled={bgImageEnabled}
          onToggle={(e) => {
            togglePropEnabled('backgroundImage', e);
            if (e) updateProp('backgroundImage', { enabled: true, value: bgImageVal });
          }}
          value={bgImageVal}
          onChange={(v) => updateProp('backgroundImage', { enabled: true, value: v })}
          onBrowse={handlePickImage}
          thumbType="image"
        />
        <StylePropRow
          plainSwitch
          label={LL.STYLE.BACKGROUND_IMAGE_NONE()}
          enabled={!!styleData.suppressBackgroundImage}
          onToggle={(e) => {
            setStyleData((prev) => ({ ...prev, suppressBackgroundImage: e }));
            setIsDirty(true);
          }}
        >
          {/* Hidden on a phone: the row's own label already says "suppress inherited", and at
              this width the hint wraps to three lines beside the switch. */}
          <Typography variant="caption" sx={{ color: 'text.secondary', display: { xs: 'none', sm: 'block' } }}>
            {LL.STYLE.BACKGROUND_IMAGE_NONE_HINT()}
          </Typography>
        </StylePropRow>
        {bgImageEnabled && (
          <SubControlsRow>
            <Select
              size="small"
              value={getProp<string>('backgroundSize').value || 'cover'}
              onChange={(e) => updateProp('backgroundSize', { enabled: true, value: e.target.value as never })}
              sx={{ width: 120 }}
            >
              <MenuItem value="cover">Cover</MenuItem>
              <MenuItem value="contain">Contain</MenuItem>
              <MenuItem value="100% auto">Fit W</MenuItem>
              <MenuItem value="auto 100%">Fit H</MenuItem>
              <MenuItem value="auto">Original</MenuItem>
            </Select>
            <CompactPositionPicker
              value={getProp<string>('backgroundPosition').value || 'center'}
              onChange={(v) => updateProp('backgroundPosition', { enabled: true, value: v })}
            />
            <Stack
              spacing={0}
              sx={{
                alignItems: 'center',
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  color: 'text.secondary',
                }}
              >
                {LL.STYLE.BG_ZOOM()}
              </Typography>
              <Slider
                size="small"
                min={100}
                max={200}
                step={5}
                value={getProp<number>('backgroundZoom').value || 100}
                onChange={(_, val) => updateProp('backgroundZoom', { enabled: true, value: val as number })}
                valueLabelDisplay="auto"
                valueLabelFormat={(v) => `${v}%`}
                sx={{ width: 80 }}
              />
            </Stack>
            <Stack
              spacing={0}
              sx={{
                alignItems: 'center',
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  color: 'text.secondary',
                }}
              >
                {LL.STYLE.BG_BLUR()}
              </Typography>
              <Slider
                size="small"
                min={0}
                max={40}
                step={1}
                value={getProp<number>('backgroundBlur').value || 0}
                onChange={(_, val) => updateProp('backgroundBlur', { enabled: true, value: val as number })}
                valueLabelDisplay="auto"
                valueLabelFormat={(v) => `${v}px`}
                sx={{ width: 80 }}
              />
            </Stack>
          </SubControlsRow>
        )}
      </PropCard>

      {/* Video layer */}
      <PropCard>
        <MediaPropRow
          label={LL.STYLE.BACKGROUND_VIDEO()}
          enabled={bgVideoEnabled}
          onToggle={(e) => {
            togglePropEnabled('backgroundVideo', e);
            if (e) updateProp('backgroundVideo', { enabled: true, value: bgVideoVal });
          }}
          value={bgVideoVal}
          onChange={(v) => updateProp('backgroundVideo', { enabled: true, value: v })}
          onBrowse={handlePickVideo}
          thumbType="video"
        />
        <StylePropRow
          plainSwitch
          label={LL.STYLE.BACKGROUND_VIDEO_NONE()}
          enabled={!!styleData.suppressBackgroundVideo}
          onToggle={(e) => {
            setStyleData((prev) => ({ ...prev, suppressBackgroundVideo: e }));
            setIsDirty(true);
          }}
        >
          {/* Hidden on a phone: the row's own label already says "suppress inherited", and at
              this width the hint wraps to three lines beside the switch. */}
          <Typography variant="caption" sx={{ color: 'text.secondary', display: { xs: 'none', sm: 'block' } }}>
            {LL.STYLE.BACKGROUND_VIDEO_NONE_HINT()}
          </Typography>
        </StylePropRow>
        {bgVideoEnabled && (
          <SubControlsRow>
            <Select
              size="small"
              value={getProp<string>('backgroundVideoSize').value || 'cover'}
              onChange={(e) => updateProp('backgroundVideoSize', { enabled: true, value: e.target.value as never })}
              sx={{ width: 120 }}
            >
              <MenuItem value="cover">Cover</MenuItem>
              <MenuItem value="contain">Contain</MenuItem>
              <MenuItem value="100% auto">Fit W</MenuItem>
              <MenuItem value="auto 100%">Fit H</MenuItem>
              <MenuItem value="auto">Original</MenuItem>
            </Select>
            <CompactPositionPicker
              value={getProp<string>('backgroundVideoPosition').value || 'center'}
              onChange={(v) => updateProp('backgroundVideoPosition', { enabled: true, value: v })}
            />
            <Stack
              spacing={0}
              sx={{
                alignItems: 'center',
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  color: 'text.secondary',
                }}
              >
                {LL.STYLE.BG_ZOOM()}
              </Typography>
              <Slider
                size="small"
                min={100}
                max={200}
                step={5}
                value={getProp<number>('backgroundVideoZoom').value || 100}
                onChange={(_, val) => updateProp('backgroundVideoZoom', { enabled: true, value: val as number })}
                valueLabelDisplay="auto"
                valueLabelFormat={(v) => `${v}%`}
                sx={{ width: 80 }}
              />
            </Stack>
            <Stack
              spacing={0}
              sx={{
                alignItems: 'center',
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  color: 'text.secondary',
                }}
              >
                {LL.STYLE.BG_BLUR()}
              </Typography>
              <Slider
                size="small"
                min={0}
                max={40}
                step={1}
                value={getProp<number>('backgroundVideoBlur').value || 0}
                onChange={(_, val) => updateProp('backgroundVideoBlur', { enabled: true, value: val as number })}
                valueLabelDisplay="auto"
                valueLabelFormat={(v) => `${v}px`}
                sx={{ width: 80 }}
              />
            </Stack>
            <Stack
              spacing={0}
              sx={{
                alignItems: 'center',
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  color: 'text.secondary',
                }}
              >
                {LL.VIDEO.VOLUME()}
              </Typography>
              <Slider
                size="small"
                min={0}
                max={1}
                step={0.05}
                value={getProp<number>('backgroundVideoVolume').value ?? 1}
                onChange={(_, val) => updateProp('backgroundVideoVolume', { enabled: true, value: val as number })}
                valueLabelDisplay="auto"
                valueLabelFormat={(v) => `${Math.round((v as number) * 100)}%`}
                sx={{ width: 80 }}
              />
            </Stack>
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={getProp<boolean>('backgroundVideoAutoplay').value !== false}
                  onChange={(e) => updateProp('backgroundVideoAutoplay', { enabled: true, value: e.target.checked })}
                />
              }
              label={<Typography variant="caption">{LL.VIDEO.AUTOPLAY()}</Typography>}
              sx={{ ml: 0 }}
            />
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={getProp<boolean>('backgroundVideoLoop').value !== false}
                  onChange={(e) => updateProp('backgroundVideoLoop', { enabled: true, value: e.target.checked })}
                />
              }
              label={<Typography variant="caption">{LL.VIDEO.LOOP()}</Typography>}
              sx={{ ml: 0 }}
            />
          </SubControlsRow>
        )}
        <Divider sx={{ my: 1 }} />
        <Typography variant="overline" sx={{ color: 'text.secondary', px: 0.5 }}>
          {LL.STYLE.SECTION_GENERAL()}
        </Typography>
        <StylePropRow
          label={LL.STYLE.VIDEO_EASE_IN()}
          enabled={getProp<number>('backgroundVideoEaseIn').enabled}
          onToggle={(e) => togglePropEnabled('backgroundVideoEaseIn', e)}

          propKeys={['backgroundVideoEaseIn']}
        >
          <Slider
            size="small"
            min={0}
            max={5}
            step={0.5}
            value={getProp<number>('backgroundVideoEaseIn').value || 0}
            onChange={(_, val) => updateProp('backgroundVideoEaseIn', { enabled: true, value: val as number })}
            valueLabelDisplay="auto"
            valueLabelFormat={(v) => `${v}s`}
            sx={{ width: 120 }}
          />
        </StylePropRow>
        <StylePropRow
          label={LL.STYLE.VIDEO_EASE_OUT()}
          enabled={getProp<number>('backgroundVideoEaseOut').enabled}
          onToggle={(e) => togglePropEnabled('backgroundVideoEaseOut', e)}

          propKeys={['backgroundVideoEaseOut']}
        >
          <Slider
            size="small"
            min={0}
            max={5}
            step={0.5}
            value={getProp<number>('backgroundVideoEaseOut').value || 0}
            onChange={(_, val) => updateProp('backgroundVideoEaseOut', { enabled: true, value: val as number })}
            valueLabelDisplay="auto"
            valueLabelFormat={(v) => `${v}s`}
            sx={{ width: 120 }}
          />
        </StylePropRow>
      </PropCard>
    </CardGrid>
  );
};
