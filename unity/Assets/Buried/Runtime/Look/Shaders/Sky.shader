// The dusk sky: `night` at the zenith, a lighter grey-blue band a little above the horizon, and
// `night` again at and below the horizon, which is the colour the fogged ground reaches far away
// (BuriedApplyFog), so the ground meets the sky without a hard line (requirement 26.2). A skybox
// shader, so Unity's default skybox is never used. No time, no stars.
Shader "Buried/Sky"
{
    Properties
    {
        _Zenith ("Zenith (night)", Color) = (0, 0, 0, 1)
        _Band ("Horizon band", Color) = (0.2, 0.2, 0.2, 1)
        _Haze ("Haze at the horizon (fog)", Color) = (0.1, 0.1, 0.1, 1)
        _BandElevation ("sin(elevation) of the band", Range(0.01, 0.5)) = 0.08
    }
    SubShader
    {
        Tags { "RenderType" = "Background" "Queue" = "Background" "PreviewType" = "Skybox" "RenderPipeline" = "UniversalPipeline" }

        Pass
        {
            Name "BuriedSky"
            ZWrite Off
            Cull Off

            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"

            CBUFFER_START(UnityPerMaterial)
                half4 _Zenith;
                half4 _Band;
                half4 _Haze;
                half _BandElevation;
            CBUFFER_END

            struct Attributes
            {
                float4 positionOS : POSITION;
            };

            struct Varyings
            {
                float4 positionCS : SV_POSITION;
                float3 direction : TEXCOORD0;
            };

            Varyings vert(Attributes input)
            {
                Varyings output;
                output.positionCS = TransformObjectToHClip(input.positionOS.xyz);
                output.direction = input.positionOS.xyz;
                return output;
            }

            half4 frag(Varyings input) : SV_Target
            {
                half e = normalize(input.direction).y; // sin(elevation)
                half b = _BandElevation;
                half3 colour;
                if (e >= b)
                {
                    half t = saturate((e - b) / (1.0 - b));
                    colour = lerp(_Band.rgb, _Zenith.rgb, sqrt(t));
                }
                else
                {
                    colour = lerp(_Haze.rgb, _Band.rgb, smoothstep(0.0, b, e));
                }
                return half4(colour, 1.0);
            }
            ENDHLSL
        }
    }
}
