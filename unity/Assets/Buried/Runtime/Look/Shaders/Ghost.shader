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
        _Emission ("Self-illumination", Range(0, 1)) = 0
        _Weight ("Era weight (alpha factor)", Range(0, 1)) = 1
        _Rise ("Vertical scale about y = 0", Range(0, 1)) = 1
        _Soft ("Soft volume (0 or 1)", Range(0, 1)) = 0
        _SoftHeight ("Soft volume: height over which it thins (m)", Float) = 9
        _SoftRoofShare ("Soft volume: share of the alpha left at the top", Range(0, 1)) = 0.25
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
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "BuriedCommon.hlsl"

            CBUFFER_START(UnityPerMaterial)
                half4 _Color;
                half _Shade;
                half _Emission;
                half _Weight;
                float _Rise;
                half _Soft;
                float _SoftHeight;
                half _SoftRoofShare;
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
                float3 positionWS : TEXCOORD2;
                float heightOS : TEXCOORD3;
            };

            Varyings vert(Attributes input)
            {
                Varyings output;
                float3 positionOS = input.positionOS.xyz;
                output.heightOS = positionOS.y; // before the rise, so a soft volume thins the same way while it rises
                positionOS.y *= _Rise; // a ghost rises from the ground: scale about y = 0 (requirement 10.5)
                float3 positionWS = TransformObjectToWorld(positionOS);
                output.positionWS = positionWS;
                output.positionCS = TransformWorldToHClip(positionWS);
                output.normalWS = TransformObjectToWorldNormal(input.normalOS);
                output.transmission = BuriedTransmission(positionWS);
                return output;
            }

            half4 frag(Varyings input) : SV_Target
            {
                half3 n = normalize(input.normalWS);
                half lit = saturate(dot(n, normalize(half3(0.6, 0.7, 0.35))));
                half3 rgb = _Color.rgb * lerp(1.0, 0.6 + 0.4 * lit, _Shade) + _Color.rgb * _Emission;
                rgb = BuriedApplyFog(rgb, input.transmission);

                half alpha = _Color.a * _Weight;
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
