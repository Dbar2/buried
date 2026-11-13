// Thin lines on screen: the outline of a building (top ring, base ring, vertical corners, and one
// ring per recorded storey). EdgeMeshBuilder emits one quad per segment. Each vertex carries its own
// end of the segment in the position, the other end in TANGENT.xyz, the side (+1 or -1) in
// TANGENT.w, the distance along the ring in uv0.x (for the dashes) and which end it is in uv0.y
// (-1 start, +1 end).
// The quad is expanded in clip space to the line width plus a narrow glow on each side, so the
// width is in screen pixels whatever the distance (requirements 20.4 and 26.4). The glow is at most
// _GlowPx pixels wide. Nothing here reads the time.
//
// Dashes (the estimated class): with _DashPeriod above 0 the line is drawn in dashes. The dash
// coordinate is the distance along the ring plus the height of the vertex, so a vertical corner
// dashes too. The period is the larger of _DashPeriod metres and _DashPeriodPx pixels at the
// vertex's distance, so the pattern reads at any zoom. Each dash is _DashOn of its period.
Shader "Buried/Edge"
{
    Properties
    {
        _Color ("Colour", Color) = (1, 1, 1, 1)
        _Alpha ("Alpha", Range(0, 1)) = 1
        _Emission ("Emission", Range(0, 4)) = 1.2
        _WidthPx ("Width (CSS px)", Float) = 1.5
        _GlowPx ("Glow each side (CSS px)", Float) = 1
        _GlowAlpha ("Glow alpha", Range(0, 1)) = 0.35
        _GlowColor ("Glow colour", Color) = (0, 0, 0, 1)
        _GlowMix ("Glow takes its own colour (0 or 1)", Range(0, 1)) = 0
        _PixelScale ("Device px per CSS px", Float) = 1
        _Rise ("Vertical scale about y = 0", Range(0, 1)) = 1
        _DashPeriod ("Dash period, least (m); 0 is a solid line", Float) = 0
        _DashPeriodPx ("Dash period, least (CSS px)", Float) = 11
        _DashOn ("Dash share of its period", Range(0.05, 0.95)) = 0.55
        _DashMinSegPx ("A segment shorter than this on screen (CSS px) is drawn solid, not dashed", Float) = 0
        [HideInInspector] _LensMode ("Lantern lens: 0 everywhere, 1 inside, 2 outside", Float) = 0
        [HideInInspector] _RaiseOn ("Raise the past drives this line (0 or 1)", Float) = 0
        [HideInInspector] _RaiseParams ("Raise: first find x, z, clock (s), farthest (m)", Vector) = (0, 0, -1, 0)
        _Sink ("Sink toward a plinth (0 full height, 1 plinth)", Range(0, 1)) = 0
        _PlinthM ("Plinth height (m)", Float) = 1
        [HideInInspector] _ZTest ("Z test", Float) = 4
        _Fogged ("Distance fog applies (1) or not (0)", Range(0, 1)) = 1
        _StoreyAlpha ("A storey line's alpha, as a share of the edge's", Range(0, 1)) = 1
        _StoreyFade ("Storey lines fade out between these camera distances (m): near, far (0 far: no fade)", Vector) = (0, 0, 0, 0)
        _HeldAlpha ("Held (before Raise): alpha of the flat outline a ghost's edge makes on the ground", Range(0, 1)) = 0
        _HeldColor ("Held outline colour", Color) = (0.43, 0.51, 0.46, 1)
    }
    SubShader
    {
        Tags { "RenderType" = "Transparent" "Queue" = "Transparent+10" "RenderPipeline" = "UniversalPipeline" }

        Pass
        {
            Name "BuriedEdge"
            Blend SrcAlpha OneMinusSrcAlpha
            ZWrite Off
            ZTest [_ZTest]
            Cull Off
            Offset -1, -1

            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_local_fragment _ _BURIED_LENS
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "BuriedCommon.hlsl"

            CBUFFER_START(UnityPerMaterial)
                half4 _Color;
                half _Alpha;
                half _Emission;
                float _WidthPx;
                float _GlowPx;
                half _GlowAlpha;
                half4 _GlowColor;
                half _GlowMix;
                float _PixelScale;
                float _Rise;
                float _DashPeriod;
                float _DashPeriodPx;
                half _DashOn;
                float _DashMinSegPx;
                half _Fogged;
                half _LensMode;
                half _RaiseOn;
                float4 _RaiseParams;
                half _Sink;
                float _PlinthM;
                half _StoreyAlpha;
                float4 _StoreyFade;
                half _HeldAlpha;
                half4 _HeldColor;
            CBUFFER_END

            struct Attributes
            {
                float4 positionOS : POSITION;
                float3 normalOS : NORMAL;
                float4 other : TANGENT;
                float2 uv : TEXCOORD0;
                float2 centre : TEXCOORD1;
            };

            struct Varyings
            {
                float4 positionCS : SV_POSITION;
                float across : TEXCOORD0;
                float transmission : TEXCOORD1;
                float dashPhase : TEXCOORD2;
                float raiseAlpha : TEXCOORD3;
                float lineAlpha : TEXCOORD4;
                float heldMix : TEXCOORD5;
                float heldKeep : TEXCOORD6;
                float dashSolid : TEXCOORD7;
            };

            Varyings vert(Attributes input)
            {
                Varyings output;
                float3 hereOS = input.positionOS.xyz;
                float3 thereOS = input.other.xyz;
                float dashCoordinate = input.uv.x + hereOS.y; // before the rise: a corner dashes as it grows
                // Before the ghost stands (session 046) only its top ring lies on the paper as an outline: the base ring, the corners
                // and the storey lines would double it up. A top ring has both ends above the ground and is not a storey line.
                output.heldKeep = step(0.01, min(hereOS.y, thereOS.y)) * (1.0 - step(0.5, input.normalOS.x));
                float raiseRise = 1.0;
                output.raiseAlpha = 1.0;
                output.heldMix = 0.0;
                if (_RaiseOn > 0.5)
                {
                    // Raise the past: the edges lead the fill (RaiseSchedule.EdgeAlpha) and grow from the ground.
                    float p = BuriedRaiseProgress(input.centre, _RaiseParams);
                    raiseRise = BuriedSmooth(p);
                    output.raiseAlpha = BuriedSmooth(p / 0.5);
                    // Before the ghost stands, its edges lie flat on the paper as a faint outline (session 043).
                    output.heldMix = 1.0 - output.raiseAlpha;
                }
                // Today's buildings sink toward a plinth: every height above _PlinthM is pulled down to it.
                hereOS.y = lerp(hereOS.y, min(hereOS.y, _PlinthM), _Sink);
                thereOS.y = lerp(thereOS.y, min(thereOS.y, _PlinthM), _Sink);
                hereOS.y *= _Rise * raiseRise; // ghosts rise from the ground (requirement 10.5); 1 for everything else
                thereOS.y *= _Rise * raiseRise;
                float3 here = TransformObjectToWorld(hereOS);
                float3 there = TransformObjectToWorld(thereOS);
                float4 clipHere = TransformWorldToHClip(here);
                float4 clipThere = TransformWorldToHClip(there);

                float2 sHere = clipHere.xy / clipHere.w * 0.5 * _ScreenParams.xy;
                float2 sThere = clipThere.xy / clipThere.w * 0.5 * _ScreenParams.xy;
                float2 toOther = sThere - sHere;
                float len = length(toOther);
                float2 dir = len > 1e-4 ? toOther / len : float2(1.0, 0.0);
                // A short segment is drawn solid: a dash pattern on a few pixels is noise (session 046).
                output.dashSolid = 1.0 - step(_DashMinSegPx * _PixelScale, len);
                float endSign = input.uv.y;
                if (endSign > 0.0) dir = -dir; // dir now always runs from the start to the end of the segment
                float2 normal = float2(-dir.y, dir.x);

                float core = 0.5 * _WidthPx * _PixelScale;
                float halfWidth = core + _GlowPx * _PixelScale;
                float side = input.other.w;
                float2 offsetPx = normal * (side * halfWidth) + dir * (endSign * halfWidth);

                clipHere.xy += offsetPx * 2.0 / _ScreenParams.xy * clipHere.w;
                output.positionCS = clipHere;
                output.across = side * halfWidth;
                output.transmission = BuriedTransmission(here);

                // A storey line (EdgeMeshBuilder marks it with normal.x = 1) is a hairline: a share of the edge's alpha, fading
                // out with distance so it does not alias into noise from far away.
                float storey = step(0.5, input.normalOS.x);
                float cameraDistance = distance(_WorldSpaceCameraPos, here);
                float fade = _StoreyFade.y > _StoreyFade.x
                    ? saturate((_StoreyFade.y - cameraDistance) / (_StoreyFade.y - _StoreyFade.x))
                    : 1.0;
                output.lineAlpha = lerp(1.0, _StoreyAlpha * fade, storey);

                // Metres per device pixel at this vertex, from the projection's vertical scale.
                float tanHalfFov = 1.0 / max(abs(UNITY_MATRIX_P._m11), 1e-4);
                float metresPerPixel = distance(_WorldSpaceCameraPos, here) * 2.0 * tanHalfFov / _ScreenParams.y;
                float period = max(_DashPeriod, _DashPeriodPx * _PixelScale * metresPerPixel);
                output.dashPhase = dashCoordinate / max(period, 1e-3);
                return output;
            }

            half4 frag(Varyings input) : SV_Target
            {
                BuriedLensClip(input.positionCS, _LensMode);
                // Dashes: not on a short segment, and not on the flat outline a held ghost makes before it stands.
                if (_DashPeriod > 0.0 && input.dashSolid < 0.5 && input.heldMix < 0.5 && frac(input.dashPhase) > _DashOn) discard;

                float core = 0.5 * _WidthPx * _PixelScale;
                float a = abs(input.across);
                float coreAlpha = saturate(core - a + 0.5);
                float glowAlpha = (1.0 - saturate((a - core) / max(_GlowPx * _PixelScale, 1e-3))) * _GlowAlpha;
                // With its own glow colour the ring is a flat casing, soft only at its outer pixel, so a
                // 1 to 2 px ring stays visible instead of fading away across its width.
                float casing = saturate(core + _GlowPx * _PixelScale - a + 0.5) * _GlowAlpha;
                glowAlpha = lerp(glowAlpha, casing, step(0.5, _GlowMix));
                float alpha = max(coreAlpha, glowAlpha) * _Alpha * input.raiseAlpha * input.lineAlpha;
                half3 rgb = _Color.rgb * _Emission;
                // The glow ring can take its own colour (_GlowMix 1): a ghost's `night` casing keeps its
                // `ink` line readable over a pale draped plate. Nothing else sets it, so 0 is the old look.
                float inGlow = step(core, a) * _GlowMix;
                rgb = lerp(rgb, _GlowColor.rgb, inGlow);
                // Held: a thin flat outline in the held colour, no casing, until the ghost's own edges take over.
                float heldAlpha = coreAlpha * _HeldAlpha * _Alpha * input.heldMix * input.heldKeep;
                alpha = max(alpha * (1.0 - input.heldMix), heldAlpha);
                rgb = lerp(rgb, _HeldColor.rgb, input.heldMix);
                rgb = lerp(rgb, BuriedApplyFog(rgb, input.transmission), _Fogged);
                return half4(rgb, alpha);
            }
            ENDHLSL
        }
    }
}
