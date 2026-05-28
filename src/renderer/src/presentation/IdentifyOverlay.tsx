/**
 * Window identification overlay.
 */
export const IdentifyOverlay = ({
  windowName,
  windowNumber,
  styleName,
}: {
  windowName?: string;
  windowNumber?: number;
  styleName?: string;
}) => {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.85)',
        zIndex: 9999,
        flexDirection: 'column',
        gap: '2vh',
      }}
    >
      {windowNumber != null && (
        <div
          style={{
            color: '#FFFFFF',
            fontSize: '16vh',
            fontFamily: 'Arial, sans-serif',
            fontWeight: 'bold',
            textAlign: 'center',
            lineHeight: 1,
            opacity: 0.3,
          }}
        >
          {windowNumber}
        </div>
      )}
      <div
        style={{
          color: '#FFFFFF',
          fontSize: '8vh',
          fontFamily: 'Arial, sans-serif',
          fontWeight: 'bold',
          textAlign: 'center',
        }}
      >
        {windowName || 'Presentation'}
      </div>
      {styleName && (
        <div
          style={{
            color: '#AAAAAA',
            fontSize: '3vh',
            fontFamily: 'Arial, sans-serif',
            textAlign: 'center',
          }}
        >
          Style: {styleName}
        </div>
      )}
    </div>
  );
};
