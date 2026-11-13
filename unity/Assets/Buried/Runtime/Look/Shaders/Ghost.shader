// A ghost's volume, and the ground: flat colour with simple fixed-direction shading and the Buried
// distance fog. Ghosts are `ink` with a little self-illumination (design.md "Materials and
// treatments"); their edges are drawn by Buried/Edge. The three confidence classes differ by
// material values, not by shader: documented and estimated are the same fill at two alphas, and an
// unknown volume turns _Soft on, which thins it toward its roof and toward its silhouette so it has
// no hard edge (design.md "Confidence encoding").
//
// Blend, depth write and culling are material properties so the same shader draws the ground
// (opaque colour, no depth write) and the translucent ghosts. Nothing here reads the time.
Shader "Buried/Ghost"
{
    Properties
    {
        _Color ("Colour", Color) = (1, 1, 1, 1)
        _Shade ("Shade strength", Range(0, 1)) = 0.35
        _ShadeColor ("Colour of the faces turned from the lamp", Color) = (0.43, 0.51, 0.46, 1)
        _ShadeMix ("How far a face turned from the lamp goes to that colour", Range(0, 1)) = 0
        _Emission ("Self-illumination", Range(0, 1)) = 0
        _Weight ("Era weight (alpha factor)", Range(0, 1)) = 1
        _Rise ("Vertical scale about y = 0", Range(0, 1)) = 1
        _Soft ("Soft volume (0 or 1)", Range(0, 1)) = 0
        _SoftHeight ("Soft volume: height over which it thins (m)", Float) = 9
        _SoftRoofShare ("Soft volume: share of the alpha left at the top", Range(0, 1)) = 0.25
        _Hatch ("Hatched sheet for a land-use area (0 or 1)", Range(0, 1)) = 0
        _HatchPeriodM ("Hatch: stripe period (m)", Float) = 2.5
        _HatchPeriodPx ("Hatch: shortest stripe period on screen (px)", Float) = 10
        _HatchInk ("Hatch: share of the period that is the ink core", Range(0.02, 0.9)) = 0.26
        _HatchCasing ("Hatch: share of the period of the casing each side", Range(0, 0.3)) = 0.09
        _HatchGap ("Hatch: alpha between the stripes, as a share of the stripe alpha", Range(0, 1)) = 0.2
        _CasingColor ("Hatch: casing colour", Color) = (0, 0, 0, 1)
        [HideInInspector] _LensMode ("Lantern lens: 0 everywhere, 1 inside, 2 outside", Float) = 0
        [HideInInspector] _RaiseOn ("Raise the past drives this ghost (0 or 1)", Float) = 0
        [HideInInspector] _RaiseParams ("Raise: first find x, z, clock (s), farthest (m)", Vector) = (0, 0, -1, 0)
        [HideInInspector] _SrcBlend ("Src blend", Float) = 5
        [HideInInspector] _DstBlend ("Dst blend", Float) = 10
        [HideInInspector] _ZWrite ("Z write", Float) = 0
        [HideInInspector] _Cull ("Cull", Float) = 2
    }
    SubShader
    {
        Tags { "RenderType" = "Transparent" "Queue" = "Transparent" "RenderPipeline" = "UniversalPipeline" }

        Pass
        {
            Name "BuriedGhost"
            Blend [_SrcBlend] [_DstBlend]
            ZWrite [_ZWrite]
            Cull [_Cull]

            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_local_fragment _ _BURIED_LENS
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "BuriedCommon.hlsl"

            CBUFFER_START(UnityPerMaterial)
                half4 _Color;
                half _Shade;
                half4 _ShadeColor;
                half _ShadeMix;
                half _Emission;
                half _Weight;
                float _Rise;
                half _Soft;
                float _SoftHeight;
                half _SoftRoofShare;
                half _Hatch;
                float _HatchPeriodM;
                float _HatchPeriodPx;
                half _HatchInk;
                half _HatchCasing;
                half _HatchGap;
                half4 _CasingColor;
                half _LensMode;
                half _RaiseOn;
                float4 _RaiseParams;
            CBUFFER_END

            struct Attributes
            {
                float4 positionOS : POSITION;
                float3 normalOS : NORMAL;
                float2 centre : TEXCOORD1;
            };

            struct Varyings
            {
                float4 positionCS : SV_POSITION;
                float3 normalWS : TEXCOORD0;
                float transmission : TEXCOORD1;
                float3 positionWS : TEXCOORD2;
                float heightOS : TEXCOORD3;
                float raiseFill : TEXCOORD4;
            };

            Varyings vert(Attributes input)
            {
                Varyings output;
                float3 positionOS = input.positionOS.xyz;
                output.heightOS = positionOS.y; // before the rise, so a soft volume thins the same way while it rises
                float raiseRise = 1.0;
                output.raiseFill = 1.0;
                if (_RaiseOn > 0.5)
                {
                    // Raise the past: this ghost stands up after its own delay (RaiseSchedule.cs): the edges lead,
                    // the fill follows, the volume grows from the ground.
                    float p = BuriedRaiseProgress(input.centre, _RaiseParams);
                    raiseRise = BuriedSmooth(p);
                    output.raiseFill = BuriedSmooth((p - 0.3333333) / 0.6666667);
                }
                positionOS.y *= _Rise * raiseRise; // a ghost rises from the ground: scale about y = 0 (requirement 10.5)
                float3 positionWS = TransformObjectToWorld(positionOS);
                output.positionWS = positionWS;
                output.positionCS = TransformWorldToHClip(positionWS);
                output.normalWS = TransformObjectToWorldNormal(input.normalOS);
                output.transmission = BuriedTransmission(positionWS);
                return output;
            }

            half4 frag(Varyings input) : SV_Target
            {
                BuriedLensClip(input.positionCS, _LensMode);
                if (_Hatch > 0.5)
                {
                    // A land-use area: diagonal stripes on the ground, an `ink` core with a casing each side (so the
                    // stripe reads on a pale plate and on dark ground, and in greyscale), over a faint tint. The
                    // stripe coordinate runs along x + z, so the lines are diagonal whatever way the camera faces.
                    // The period is _HatchPeriodM, doubled until a period is at least _HatchPeriodPx pixels wide
                    // (metres per pixel from the screen derivatives of the ground position), so stripes never
                    // shrink to the pixel grid; octave steps keep it from shimmering as the camera moves.
                    float metresPerPixel = max(fwidth(input.positionWS.x) + fwidth(input.positionWS.z), 1e-4);
                    float octaves = ceil(log2(max(_HatchPeriodPx * metresPerPixel / max(_HatchPeriodM, 1e-3), 1.0)));
                    float period = _HatchPeriodM * exp2(octaves);
                    float s = (input.positionWS.x + input.positionWS.z) / period;
                    float t = abs(frac(s) - 0.5); // 0 at a stripe's centre, 0.5 halfway between two
                    float aa = max(fwidth(s), 1e-4);
                    float coreHalf = 0.5 * _HatchInk;
                    float casingHalf = coreHalf + _HatchCasing;
                    float core = 1.0 - smoothstep(coreHalf - aa, coreHalf + aa, t);
                    float cased = 1.0 - smoothstep(casingHalf - aa, casingHalf + aa, t);
                    half3 stripe = lerp(_CasingColor.rgb, _Color.rgb * (1.0 + _Emission), core);
                    half3 hatchRgb = BuriedApplyFog(stripe, input.transmission);
                    half hatchAlpha = _Color.a * _Weight * lerp(_HatchGap, 1.0, cased) * input.raiseFill;
                    return half4(hatchRgb, hatchAlpha);
                }
                half3 n = normalize(input.normalWS);
                // The one lamp: faces turned from it take `copper` (_ShadeColor), faces toward it keep the fill colour.
                half lit = saturate(dot(n, normalize(_BuriedLampDir.xyz + 1e-5)));
                half3 rgb = _Color.rgb * lerp(1.0, 0.6 + 0.4 * lit, _Shade);
                rgb = lerp(rgb, _ShadeColor.rgb * (0.6 + 0.4 * lit), (1.0 - lit) * _ShadeMix) + _Color.rgb * _Emission;
                rgb = BuriedApplyFog(rgb, input.transmission);

                half alpha = _Color.a * _Weight * input.raiseFill;
                if (_Soft > 0.5)
                {
                    // Thin toward the roof, and toward the silhouette (a face seen edge-on), so the
                    // volume has no hard edge and no readable corner: a fog the shape of the footprint.
                    half toRoof = saturate(input.heightOS / max(_SoftHeight, 0.1));
                    half vertical = lerp(1.0, _SoftRoofShare, toRoof);
                    float3 toCamera = normalize(_WorldSpaceCameraPos - input.positionWS);
                    half facing = sqrt(saturate(abs(dot(n, toCamera))));
                    alpha *= vertical * lerp(0.35, 1.0, facing);
                }
                return half4(rgb, alpha);
            }
            ENDHLSL
        }
    }
}
