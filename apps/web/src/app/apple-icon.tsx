import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          borderRadius: 40,
          background: '#075e54',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Speech bubble */}
        <div
          style={{
            width: 110,
            height: 100,
            borderRadius: 28,
            background: '#25d366',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <div style={{ width: 60, height: 8, background: 'white', borderRadius: 4 }} />
          <div style={{ width: 60, height: 8, background: 'white', borderRadius: 4 }} />
          <div style={{ width: 40, height: 8, background: 'white', borderRadius: 4 }} />
        </div>
      </div>
    ),
    size,
  )
}
