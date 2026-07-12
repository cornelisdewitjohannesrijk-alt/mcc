import { ImageResponse } from 'next/og'

export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: '#075e54',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Chat bubble */}
        <div
          style={{
            width: 20,
            height: 18,
            borderRadius: 10,
            background: '#25d366',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
          }}
        >
          <div style={{ width: 10, height: 2, background: 'white', borderRadius: 1, marginTop: -2 }} />
          <div style={{ width: 10, height: 2, background: 'white', borderRadius: 1, marginTop: 2, position: 'absolute' }} />
        </div>
      </div>
    ),
    size,
  )
}
