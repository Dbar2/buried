// A ghost's volume, and the ground: flat colour with simple fixed-direction shading and the Buried
// distance fog. Ghosts are `ink` at alpha 0.35 with a little self-illumination (design.md
// "Materials and treatments"); their edges are drawn by Buried/Edge. The dashed and fog-volume
// treatments of the other confidence classes come in task group 4.
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
                half3 n = normalize(input.normalWS);
                half lit = saturate(dot(n, normalize(half3(0.6, 0.7, 0.35))));
                half3 rgb = _Color.rgb * lerp(1.0, 0.6 + 0.4 * lit, _Shade) + _Color.rgb * _Emission;
                rgb = BuriedApplyFog(rgb, input.transmission);
                return half4(rgb, _Color.a);
            }
            ENDHLSL
        }
    }
}
