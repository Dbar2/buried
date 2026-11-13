// Today's buildings: matte `present` volumes lit by the sun only (cold light, no warm source), no
// texture, no windows (requirement 20.3). Opaque when fully drawn; the blend properties let a
// later depth transition fade the fill. Distance fog toward the fog colour.
//
// Session 023: near the camera the walls are darker than the fog (a leeward wall is about a quarter
// of `present`, a sunward one about two fifths) and dissolve into it with distance, which is what the
// fog does to anything that is not already the fog colour. The roof keeps more of the sky light, so
// it is the lightest face and reads against the ground (look.spec.ts holds roofs to 1.35 : 1). A thin
// lighter line along each roof (PresentLayer, Buried/Edge) keeps the volume legible. Same cold hue
// throughout; no warm light and no texture.
Shader "Buried/Present"
{
    Properties
    {
        _Color ("Colour", Color) = (1, 1, 1, 1)
        _Ambient ("Leeward wall light", Range(0, 4)) = 0.28
        _SunGain ("Sun gain (sunward walls)", Range(0, 8)) = 0.5
        _RoofGain ("Roof gain (sky light)", Range(0, 4)) = 3.2
        _Alpha ("Alpha", Range(0, 1)) = 1
        [HideInInspector] _LensMode ("Lantern lens: 0 everywhere, 1 inside, 2 outside", Float) = 0
        [HideInInspector] _SrcBlend ("Src blend", Float) = 1
        [HideInInspector] _DstBlend ("Dst blend", Float) = 0
        [HideInInspector] _ZWrite ("Z write", Float) = 1
    }
    SubShader
    {
        Tags { "RenderType" = "Opaque" "Queue" = "Geometry" "RenderPipeline" = "UniversalPipeline" }

        Pass
        {
            Name "BuriedPresent"
            Tags { "LightMode" = "UniversalForward" }
            Blend [_SrcBlend] [_DstBlend]
            ZWrite [_ZWrite]
            Cull Back

            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"
            #include "BuriedCommon.hlsl"

            CBUFFER_START(UnityPerMaterial)
                half4 _Color;
                half _Ambient;
                half _SunGain;
                half _RoofGain;
                half _Alpha;
                half _LensMode;
            CBUFFER_END

            struct Attributes
            {
                float4 positionOS : POSITION;
                float3 normalOS : NORMAL;
            };

            struct Varyings
            {
                float4 positionCS : SV_POSITION;
                float3 normalWS : TEXCOORD0;
                float transmission : TEXCOORD1;
            };

            Varyings vert(Attributes input)
            {
                Varyings output;
                float3 positionWS = TransformObjectToWorld(input.positionOS.xyz);
                output.positionCS = TransformWorldToHClip(positionWS);
                output.normalWS = TransformObjectToWorldNormal(input.normalOS);
                output.transmission = BuriedTransmission(positionWS);
                return output;
            }

            half4 frag(Varyings input) : SV_Target
            {
                BuriedLensClip(input.positionCS, _LensMode);
                half3 n = normalize(input.normalWS);
                Light sun = GetMainLight();
                half lit = saturate(dot(n, sun.direction));
                // Three steps of one cold grey: walls facing away from the low west sun, walls
                // facing it (the sun term), and roofs (the sky term), lightest. Same hue, no warm light.
                half3 rgb = _Color.rgb * (_Ambient + _RoofGain * saturate(n.y) + sun.color * (lit * _SunGain));
                rgb = BuriedApplyFog(rgb, input.transmission);
                return half4(rgb, _Alpha);
            }
            ENDHLSL
        }
    }
}
